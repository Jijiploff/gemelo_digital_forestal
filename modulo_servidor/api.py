"""API de inferencia y simulación del Laboratorio React.

Carga los artefactos de entrenamiento reales de MODELOS_DIR (modelos_entrenados)
y los usa para /modelo/mejor y /simular. Si un artefacto no está disponible,
degrada ese componente al simulador analítico para no romper la interfaz.

Modificaciones implementadas:
  1. Carga de JSON con lru_cache: _estado_base, _observaciones y _validacion (tolerantes a archivo ausente).
  2. Ventana del LSTM: meses t-4 a t-1 con fechas reales (año y mes), no restando al número de mes.
  3. Dos ramas de entrada:
     - LSTM: LAI y NPP_3PG calculados desde MODIS_NDVI del estado base.
     - AGB_GEDI e INCENDIO: NDVI y LAI combinados, como se entrenaron.
     - El manejo del escenario se aplica a cada rama por separado.
  4. Años sin estado: año por defecto 2025. Para meses sin estado (o > 2025), usa climatología y lo marca.
  5. temporal: añade nee_base y nee_escenario por mes.
  6. /simular: añade bloque de referencia con media y desviación observada, valor observado,
     calidad e incertidumbre, indicador de dato de entrenamiento, origen del estado y marca de frescura.
  7. Endpoints /observaciones y /validacion sirven los JSON completos.
  8. /modelo/mejor: métricas de ajuste de metricas_ajuste con la etiqueta "ajuste (datos de entrenamiento)".
  9. Textos (_insumos y Gemini): incluyen "ajuste", media observada 2002-2011 (+0.86, emisión neta) y régimen MODIS.
  10. Entradas: precipitación en mm/día (divide el slider mensual entre los días del mes),
      _npp3pg con fórmula exacta y recorte, y límite de entradas del LSTM al rango 2002-2011.
"""
import math, os, random
import requests
from datetime import datetime
from functools import lru_cache
from pathlib import Path
import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from config import SOURCE_VERSION, GEMINI_API_KEY, GEMINI_MODEL


app = FastAPI(title="Gemelo Digital Forestal API", version="2.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BASE_DIR = Path(__file__).resolve().parent.parent
MODELOS_DIR = BASE_DIR / "modelos_entrenados"
RECURSOS_DIR = BASE_DIR / "recursos" / "datos_reales"
PARCELA_PATH = RECURSOS_DIR / "parcela_tapajos.json"
ESTADO_BASE_PATH = RECURSOS_DIR / "estado_base_tapajos.json"
OBSERVACIONES_PATH = RECURSOS_DIR / "observaciones_flujos.json"
VALIDACION_PATH = RECURSOS_DIR / "validacion_gemelo.json"
METRICAS_ARTICULO_DIR = MODELOS_DIR / "metricas_articulo"

METRICAS_ARTICULO_DESCRIPCIONES = {
    "fig3_correlaciones_pearson.png": ("Figura 3 · Correlaciones de Pearson", "Matriz de correlaciones entre variables biofísicas, climáticas, flujos de carbono y riesgo de incendio en BR-Sa1."),
    "fig4_serie_temporal_264_meses.png": ("Figura 4 · Serie temporal de 264 meses", "Evolución histórica de flujos FLUXNET, forzantes ERA5 y observaciones de biomasa AGBD GEDI."),
    "fig6_boxplots_pliegues.png": ("Figura 6 · Validación cruzada por pliegue", "Distribución de R², RMSE y MAE en los cinco pliegues de la evaluación cruzada."),
    "fig8_simulacion_escenarios.png": ("Figura 8 · Simulación de escenarios", "Respuesta mensual de NEE, biomasa AGBD y riesgo de incendio para escenarios de manejo forestal."),
    "qq_residuos.png": ("Diagnóstico QQ de residuos", "Gráficos QQ para evaluar la distribución de residuos en entrenamiento y fuera de muestra."),
}

# Parámetros 3-PG extraídos de metadata.definiciones_entrenamiento
_LUE_MAX = 1.8
_TEMP_OPT = 26.0
_TEMP_RANGO = 12.0

# Rangos de entradas que vio el LSTM en entrenamiento (2002-2011)
RANGOS_LSTM_ENTRENAMIENTO = {
    "NPP_3PG": (0.1, 0.1298),
    "TA_ERA": (24.655, 27.076),
    "P_ERA": (0.362, 18.463),
    "SW_IN_ERA": (125.578, 244.018),
    "VPD_ERA": (2.703, 9.981),
    "LAI": (1.05623, 2.96314),
}


# ---------------------------------------------------------------------------
# Carga tolerante con lru_cache
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _datos_parcela():
    """Carga los datos satelitales reales de Tapajós BR-Sa1 si están disponibles."""
    try:
        if PARCELA_PATH.exists():
            import json
            return json.loads(PARCELA_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return None


@lru_cache(maxsize=1)
def _estado_base():
    """Carga el JSON de serie temporal + climatología + rangos del sitio Tapajós.
    Devuelve el dict con índices rápidos o None si el archivo no existe.
    """
    try:
        if ESTADO_BASE_PATH.exists():
            import json
            data = json.loads(ESTADO_BASE_PATH.read_text(encoding="utf-8"))
            data["_serie_idx"] = {
                (r["year"], r["month"]): r for r in data.get("serie", [])
            }
            data["_clim_idx"] = {
                r["month"]: r for r in data.get("climatologia", [])
            }
            return data
    except Exception:
        pass
    return None


@lru_cache(maxsize=1)
def _observaciones():
    """Carga el JSON de observaciones de flujos de la torre Tapajós (2002-2025)."""
    try:
        if OBSERVACIONES_PATH.exists():
            import json
            data = json.loads(OBSERVACIONES_PATH.read_text(encoding="utf-8"))
            data["_serie_idx"] = {
                (r["year"], r["month"]): r for r in data.get("serie", [])
            }
            data["_clim_idx"] = {
                r["month"]: r for r in data.get("climatologia_observada", [])
            }
            return data
    except Exception:
        pass
    return None


@lru_cache(maxsize=1)
def _validacion():
    """Carga el JSON de validación y ajuste del gemelo digital."""
    try:
        if VALIDACION_PATH.exists():
            import json
            return json.loads(VALIDACION_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return None


def _clamp(v, a, b):
    return max(a, min(b, float(v)))


@lru_cache(maxsize=1)
def _artefactos():
    """Carga perezosa de modelos y scalers con degradación por componente."""
    out = {"best": None, "agb": None, "incendio": None, "lstm": None,
           "sc_agb": None, "sc_inc": None, "sc_lstm": None}
    try:
        p = MODELOS_DIR / "mejor_modelo.json"
        if p.exists():
            out["best"] = p.read_text(encoding="utf-8")
    except Exception:
        pass
    for key, fn in (("agb", "AGB_GEDI.joblib"), ("incendio", "INCENDIO.joblib")):
        try:
            import joblib
            out[key] = joblib.load(MODELOS_DIR / fn)
        except Exception:
            out[key] = None
    for key, fn in (("sc_agb", "AGB_GEDI_scaler.joblib"), ("sc_inc", "INCENDIO_scaler.joblib")):
        try:
            import joblib
            out[key] = joblib.load(MODELOS_DIR / fn)
        except Exception:
            out[key] = None
    out["lstm"] = None
    out["sc_lstm"] = None
    return out


@lru_cache(maxsize=1)
def _cargar_lstm():
    """Carga perezosa del modelo 3-PG LSTM (keras) + scaler. Devuelve (modelo, scaler)."""
    try:
        # pyrefly: ignore [missing-import]
        from keras.models import load_model
        import joblib
        lstm = load_model(MODELOS_DIR / "3PG_LSTM.h5", compile=False)
        sc_lstm = joblib.load(MODELOS_DIR / "3PG_LSTM_scaler.joblib")
        return lstm, sc_lstm
    except Exception:
        return None, None


def _lstm_ok():
    return _cargar_lstm()[0] is not None


def _par(s, k, d):
    v = s.get(k, d)
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(d)


# ---------------------------------------------------------------------------
# Fórmulas fisiológicas y de sensores
# ---------------------------------------------------------------------------

def _npp3pg(lai, sw_in, p_era, ta):
    """Recalcula NPP_3PG con la fórmula exacta de metadata.definiciones_entrenamiento:
    clip(lue_max*f_temp*f_agua*f_apar*(SW_IN_ERA/100)*0.47, 0.1, 15)
    f_temp parabólica entre temp_opt±temp_rango (piso 0.05)
    f_agua = clip(P_ERA/150, 0.1, 1)
    f_apar = 1 - exp(-0.5 * clip(LAI, 0.1, 8))

    Parámetros
    ----------
    lai   : LAI efectivo del escenario (m2/m2)
    sw_in : SW_IN_ERA del mes (W/m2)
    p_era : P_ERA del mes en mm/día
    ta    : TA_ERA del mes en °C
    """
    dt = abs(ta - _TEMP_OPT)
    if dt >= _TEMP_RANGO:
        f_temp = 0.05
    else:
        f_temp = max(0.05, 1.0 - (dt / _TEMP_RANGO) ** 2)
    f_agua = _clamp(p_era / 150.0, 0.1, 1.0)
    f_apar = 1.0 - math.exp(-0.5 * _clamp(lai, 0.1, 8.0))
    raw = _LUE_MAX * f_temp * f_agua * f_apar * (sw_in / 100.0) * 0.47
    return _clamp(raw, 0.1, 15.0)


def _lai_desde_ndvi(ndvi):
    """LAI = -ln(1 - clip(NDVI, 0.05, 0.95)) / 0.5"""
    ndvi_c = _clamp(ndvi, 0.05, 0.95)
    return -math.log(1.0 - ndvi_c) / 0.5


def _fmc_desde_s1(s1_vv, s1_vh):
    """FMC = clip(60 + 1.2 * clip(S1_VH - S1_VV, -15, 15), 5, 200)"""
    diff = _clamp(s1_vh - s1_vv, -15.0, 15.0)
    return _clamp(60.0 + 1.2 * diff, 5.0, 200.0)


def _dias_del_mes(year, month):
    """Días del mes considerando bisiestos."""
    if month == 2:
        return 29 if ((year % 4 == 0 and year % 100 != 0) or year % 400 == 0) else 28
    return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]


def _mes_anterior(year, month, k):
    """Devuelve (year, month) retrocediendo k meses con fechas reales (cruza el cambio de año)."""
    total = year * 12 + (month - 1) - k
    return total // 12, (total % 12) + 1


# ---------------------------------------------------------------------------
# Dos ramas de entrada y manejo del escenario
# ---------------------------------------------------------------------------

def _estado_base_mes(year, month):
    """Extrae las variables base del sitio para (year, month).
    Si el mes no existe en la serie o no está completo, usa la climatología mensual.
    Devuelve dict con todas las variables necesarias y 'origen'.
    """
    eb = _estado_base()
    if eb is None:
        # Fallback sintético
        return {
            "s1_vv": -10.3, "s1_vh": -17.0,
            "ndvi": 0.51, "lai": 1.51,
            "modis_ndvi": 0.57, "modis_lai": 1.70,
            "fmc": 52.0, "ta": 26.0, "p": 5.0, "sw_in": 187.0, "vpd": 5.1,
            "origen": "sintetica", "en_entrenamiento": False
        }

    reg = eb["_serie_idx"].get((year, month))
    if reg is not None and reg.get("completo_todos", False):
        modis_ndvi = float(reg.get("MODIS_NDVI") if reg.get("MODIS_NDVI") is not None else reg.get("NDVI", 0.57))
        ndvi = float(reg.get("NDVI", 0.51))
        return {
            "s1_vv": float(reg.get("S1_VV", -10.3)),
            "s1_vh": float(reg.get("S1_VH", -17.0)),
            "ndvi": ndvi,
            "lai": float(reg.get("LAI", _lai_desde_ndvi(ndvi))),
            "modis_ndvi": modis_ndvi,
            "modis_lai": _lai_desde_ndvi(modis_ndvi),
            "fmc": float(reg.get("FMC", 52.0)) if reg.get("FMC") is not None else _fmc_desde_s1(float(reg.get("S1_VV", -10.3)), float(reg.get("S1_VH", -17.0))),
            "ta": float(reg.get("TA_ERA", 26.0)),
            "p": float(reg.get("P_ERA", 5.0)),
            "sw_in": float(reg.get("SW_IN_ERA", 187.0)),
            "vpd": float(reg.get("VPD_ERA", 5.1)),
            "origen": reg.get("origen", "serie"),
            "en_entrenamiento": bool(reg.get("en_entrenamiento", False))
        }

    # Fallback a climatología
    clim = eb["_clim_idx"].get(month, {})
    modis_ndvi = float(clim.get("MODIS_NDVI_mean", 0.57))
    ndvi = float(clim.get("NDVI_mean", 0.51))
    fmc = float(clim.get("FMC_mean", 52.0))
    s1_vv = float(clim.get("S1_VV_mean", -10.3))
    s1_vh = float(clim.get("S1_VH_mean", -17.0))
    origen = "serie_parcial (fallback climatologia)" if reg is not None else f"climatologia (mes {month})"
    return {
        "s1_vv": s1_vv,
        "s1_vh": s1_vh,
        "ndvi": ndvi,
        "lai": float(clim.get("LAI_mean", _lai_desde_ndvi(ndvi))),
        "modis_ndvi": modis_ndvi,
        "modis_lai": _lai_desde_ndvi(modis_ndvi),
        "fmc": fmc,
        "ta": float(clim.get("TA_ERA_mean", 26.0)),
        "p": float(clim.get("P_ERA_mean", 5.0)),
        "sw_in": float(clim.get("SW_IN_ERA_mean", 187.0)),
        "vpd": float(clim.get("VPD_ERA_mean", 5.1)),
        "origen": origen,
        "en_entrenamiento": False
    }


def _gestion(s, year, month):
    """Calcula el estado del escenario aplicando el manejo a dos ramas de entrada independientes:
    - Rama AGB_GEDI e INCENDIO: a partir de NDVI/LAI combinados.
    - Rama LSTM: a partir de MODIS_NDVI y su LAI respectivo (régimen MODIS de entrenamiento).
    - Precipitación: divide el slider mensual entre los días del mes para pasar a mm/día.
    """
    cl = _par(s, "clareo_pct", 0) / 100.0
    qu = _par(s, "quema_pct", 0) / 100.0
    res = _par(s, "restauracion_plantas_ha", 0)
    fuel = _par(s, "manejo_combustibles", 0) / 100.0

    base = _estado_base_mes(year, month)

    # Forzantes climáticos del usuario o base
    dias = _dias_del_mes(year, month)
    if "precipitacion_mm" in s and s["precipitacion_mm"] is not None:
        p = max(0.0, float(s["precipitacion_mm"]) / dias)
    else:
        p = base["p"]

    ta = _par(s, "temperatura_c", base["ta"])
    sw_in = base["sw_in"]
    vpd = base["vpd"]

    # --- Rama 1: AGB_GEDI e INCENDIO (NDVI y LAI combinados) ---
    ndvi_ef = _clamp(base["ndvi"] * (1.0 - cl) * (1.0 - qu * 0.8) + res * 0.0002, 0.0, 1.0)
    lai_ef = _lai_desde_ndvi(ndvi_ef)
    fmc_ef = _clamp(base["fmc"] * (1.0 + fuel * 0.05), 5.0, 200.0)
    npp_inc = _npp3pg(lai_ef, sw_in, p, ta)

    # --- Rama 2: LSTM (MODIS_NDVI y LAI respectivo) ---
    modis_ndvi_ef = _clamp(base["modis_ndvi"] * (1.0 - cl) * (1.0 - qu * 0.8) + res * 0.0002, 0.0, 1.0)
    modis_lai_ef = _lai_desde_ndvi(modis_ndvi_ef)
    npp_lstm = _npp3pg(modis_lai_ef, sw_in, p, ta)

    return {
        "cl": cl, "qu": qu, "fuel": fuel, "res": res,
        # Base
        "ndvi_obs": base["ndvi"], "lai_obs": base["lai"],
        "modis_ndvi_obs": base["modis_ndvi"], "modis_lai_obs": base["modis_lai"],
        # Rama combinada
        "ndvi_ef": ndvi_ef, "lai_ef": lai_ef, "fmc_ef": fmc_ef,
        "npp_inc": npp_inc,
        # Rama LSTM
        "modis_ndvi_ef": modis_ndvi_ef, "modis_lai_ef": modis_lai_ef,
        "npp_lstm": npp_lstm,
        # Clima
        "ta": ta, "p": p, "sw_in": sw_in, "vpd": vpd,
        "s1_vv": base["s1_vv"], "s1_vh": base["s1_vh"],
        "origen": base["origen"], "en_entrenamiento": base["en_entrenamiento"],
    }


def _fila(year, month, g):
    """Construye las filas de predictoras para cada modelo en (year, month).
    Limita las entradas del escenario para el LSTM al rango visto en 2002-2011.
    """
    # Si (year, month) coincide con el mes de la simulación usamos g directo;
    # si es un mes anterior de la ventana LSTM, evaluamos ese mes con la gestión aplicada
    reg = _gestion(g, year, month) if (year != g.get("_target_year") or month != g.get("_target_month")) else g

    # Rama AGB_GEDI
    agb_vec = [reg["s1_vv"], reg["s1_vh"], reg["ndvi_ef"], reg["lai_ef"], reg["fmc_ef"], reg["ta"], reg["p"], reg["vpd"]]

    # Rama INCENDIO
    inc_vec = [reg["ndvi_ef"], reg["lai_ef"], reg["ta"], reg["p"], reg["sw_in"], reg["vpd"], reg["npp_inc"]]

    # Rama LSTM: LAI y NPP_3PG desde MODIS_NDVI, limitados al rango de 2002-2011
    npp_lim = _clamp(reg["npp_lstm"], *RANGOS_LSTM_ENTRENAMIENTO["NPP_3PG"])
    ta_lim = _clamp(reg["ta"], *RANGOS_LSTM_ENTRENAMIENTO["TA_ERA"])
    p_lim = _clamp(reg["p"], *RANGOS_LSTM_ENTRENAMIENTO["P_ERA"])
    sw_lim = _clamp(reg["sw_in"], *RANGOS_LSTM_ENTRENAMIENTO["SW_IN_ERA"])
    vpd_lim = _clamp(reg["vpd"], *RANGOS_LSTM_ENTRENAMIENTO["VPD_ERA"])
    lai_lim = _clamp(reg["modis_lai_ef"], *RANGOS_LSTM_ENTRENAMIENTO["LAI"])

    lstm_vec = [npp_lim, ta_lim, p_lim, sw_lim, vpd_lim, lai_lim]

    return {
        "agb": agb_vec,
        "inc": inc_vec,
        "lstm": lstm_vec,
        "_npp": reg["npp_inc"],
        "_ta": reg["ta"], "_p": reg["p"], "_sw_in": reg["sw_in"], "_vpd": reg["vpd"],
        "_modis_lai": reg["modis_lai_ef"],
    }


def _fuente():
    try:
        import json
        return json.loads(_artefactos()["best"]).get("fuente_version", SOURCE_VERSION)
    except Exception:
        return SOURCE_VERSION


def _pred_biomasa(f, art):
    if art["agb"] is not None and art["sc_agb"] is not None:
        try:
            return float(art["agb"].predict(art["sc_agb"].transform([f]))[0])
        except Exception:
            return None
    return None


def _pred_riesgo(f, art):
    if art["incendio"] is not None and art["sc_inc"] is not None:
        try:
            return float(art["incendio"].predict_proba(art["sc_inc"].transform([f]))[0][1])
        except Exception:
            return None
    return None


def _pred_nee(ventana, art):
    lstm, sc_lstm = _cargar_lstm()
    if lstm is not None and sc_lstm is not None:
        try:
            x = sc_lstm.transform(ventana).astype(np.float32).reshape(1, 4, 6)
            return float(np.asarray(lstm.predict(x, verbose=0)).ravel()[0])
        except Exception:
            return None
    return None


def _escenarios(s, year, month):
    """Devuelve (escenario, neutro) en términos de gestión y clima."""
    scen = _gestion(s, year, month)
    scen["_target_year"] = year
    scen["_target_month"] = month
    scen["precipitacion_mm"] = s.get("precipitacion_mm")
    scen["temperatura_c"] = s.get("temperatura_c")

    neutro_s = dict(s)
    for k in ("clareo_pct", "quema_pct", "restauracion_plantas_ha", "manejo_combustibles"):
        neutro_s[k] = 0
    neutro = _gestion(neutro_s, year, month)
    neutro["_target_year"] = year
    neutro["_target_month"] = month
    neutro["precipitacion_mm"] = s.get("precipitacion_mm")
    neutro["temperatura_c"] = s.get("temperatura_c")

    return scen, neutro


def _npp_analitico(g):
    """Fórmula analítica del KPI NPP."""
    n = 8.4
    return n * (1 + g["lai_ef"] * 0.03 + g["ndvi_ef"] * 0.08 + g["p"] / 1000 - g["ta"] * 0.002)


def _sim_analitico(g, art, year, month):
    """Fallback analítico si fallan los modelos entrenados."""
    b = 210.0
    qu = g["qu"]; cl = g["cl"]; fuel = g["fuel"]; res = g["res"]
    bm = b * (1 - cl - qu * 0.8) + res * 0.018 + fuel * 0.04
    risk = _clamp(0.28 + cl * 0.002 + qu * 0.0025 - res * 0.00018 - fuel * 0.004
                  + (55 - g["fmc_ef"]) * 0.003 + (1.8 - g["lai_ef"]) * 0.04
                  + (1 - g["ndvi_ef"]) * 0.12, 0.02, 0.98)
    return {"biomasa": bm, "npp": _npp_analitico(g), "riesgo": risk}


def _resumen(g, art, year, month):
    """Calcula predicciones para un mes dado.
    La ventana del LSTM toma los 4 meses anteriores t-4..t-1 en fechas reales.
    """
    f = _fila(year, month, g)
    out = _sim_analitico(g, art, year, month)
    bm = _pred_biomasa(f["agb"], art)
    if bm is not None:
        out["biomasa"] = bm
    rk = _pred_riesgo(f["inc"], art)
    if rk is not None:
        out["riesgo"] = _clamp(rk, 0.02, 0.98)

    # Ventana de 4 meses reales: t-4, t-3, t-2, t-1 (regla de alineación confirmada)
    ventana = [_fila(*_mes_anterior(year, month, k), g)["lstm"] for k in (4, 3, 2, 1)]
    nee = _pred_nee(ventana, art)
    out["nee"] = nee
    out["npp"] = _npp_analitico(g)
    return out


def _trees(risk, biomass):
    parcela = _datos_parcela()
    if parcela and "arboles" in parcela:
        out = []
        rng = random.Random(42)
        for t in parcela["arboles"]:
            h = float(t.get("height", 24.0))
            elev = float(t.get("elevation", 92.0))
            en_3d = bool(t.get("en_subparcela_3d", False))
            rr = _clamp(risk + rng.uniform(-0.10, 0.10), 0.03, 0.98)
            out.append({
                "x": float(t["x"]),
                "y": float(t["y"]),
                "height": h,
                "crown": float(t.get("crown", 1.2 + h * 0.09)),
                "biomass": (biomass / 210.0) * (h / 18.0),
                "risk": rr,
                "loss": rng.random() * 0.10,
                "elevation": elev,
                "en_subparcela_3d": en_3d
            })
        return out

    rng = random.Random(42)
    out = []
    for i in range(700):
        col = i % 35
        row = i // 35
        x = col / 34 * 100 - 50
        y = row / 19 * 60 - 30
        onda = math.sin(x * 0.09) * math.cos(y * 0.12) * 0.5 + 0.5
        jitter = rng.uniform(-0.15, 0.15)
        h = _clamp(7 + (onda + jitter) * 22 + (x + y) * 0.02, 5, 32)
        rr = _clamp(risk + rng.uniform(-0.15, 0.15), 0.03, 0.98)
        out.append({"x": x, "y": y, "height": h, "crown": 1.2 + h * 0.09,
                    "biomass": biomass / 210 * (h / 18), "risk": rr,
                    "loss": rng.random() * 0.12, "elevation": 92.0, "en_subparcela_3d": True})
    return out


PRED_META = {
    "agb": [("S1_VV", "dB"), ("S1_VH", "dB"), ("NDVI", ""), ("LAI", "m2/m2"), ("FMC", "%"),
            ("TA_ERA", "C"), ("P_ERA", "mm/dia"), ("VPD_ERA", "hPa")],
    "inc": [("NDVI", ""), ("LAI", "m2/m2"), ("TA_ERA", "C"), ("P_ERA", "mm/dia"),
            ("SW_IN_ERA", "W/m2"), ("VPD_ERA", "hPa"), ("NPP_3PG", "")],
    "lstm": [("NPP_3PG (MODIS)", ""), ("TA_ERA", "C"), ("P_ERA", "mm/dia"), ("SW_IN_ERA", "W/m2"),
             ("VPD_ERA", "hPa"), ("LAI (MODIS)", "m2/m2")],
}


def _predictoras(kind, vec):
    return [{"nombre": n, "valor": round(v, 3), "unidad": u} for (n, u), v in zip(PRED_META[kind], vec)]


def _insumos(scen, year, month, cur, base, art, payload):
    """Traza de la inferencia: qué datos recibió cada rama y qué devolvió cada modelo."""
    f = _fila(year, month, scen)
    cl = round(_par(payload, "clareo_pct", 0), 1)
    qu = round(_par(payload, "quema_pct", 0), 1)
    res = round(_par(payload, "restauracion_plantas_ha", 0))
    fuel = round(_par(payload, "manejo_combustibles", 0), 1)
    fmc = scen["fmc_ef"]

    # Ventana real t-4..t-1
    fechas_ventana = [_mes_anterior(year, month, k) for k in (4, 3, 2, 1)]
    str_ventana = ", ".join(f"{y}-{m:02d}" for y, m in fechas_ventana)

    # Media observada 2002-2011 leída del JSON
    obs = _observaciones()
    media_obs_val = 0.86
    if obs and "metadata" in obs and "nee_observado" in obs["metadata"]:
        media_obs_val = round(obs["metadata"]["nee_observado"].get("media", 0.86), 2)

    modelos = [
        {"objetivo": "Biomasa", "modelo": "AGB_GEDI" if art["agb"] else "sintetico",
         "tipo": "Random Forest regresion", "predictoras": _predictoras("agb", f["agb"]),
         "resultado": round(cur["biomasa"], 2), "unidad": "Mg/ha",
         "rama": "Combinada (S2/MODIS + S1)"},
        {"objetivo": "Riesgo incendio", "modelo": "INCENDIO" if art["incendio"] else "sintetico",
         "tipo": "Random Forest clasificacion", "predictoras": _predictoras("inc", f["inc"]),
         "resultado": round(cur["riesgo"], 3), "unidad": "probabilidad",
         "rama": "Combinada (NDVI/LAI + Clima)"},
        {"objetivo": "NEE", "modelo": "3PG_LSTM" if _lstm_ok() else "no disponible",
         "tipo": "Hibrido fisiologico-LSTM (ajuste)", "predictoras": _predictoras("lstm", f["lstm"]),
         "resultado": round(cur["nee"], 3) if cur["nee"] is not None else None, "unidad": "gC m-2 d-1",
         "rama": "Régimen MODIS (LAI y NPP desde MODIS_NDVI)"},
    ]

    notes = [
        f"Ventana de predicción del LSTM: meses {str_ventana} (t-4 a t-1 con fechas reales del calendario).",
        "Dos ramas de entrada: AGB_GEDI e INCENDIO procesan la vegetación combinada (Sentinel-2/MODIS). "
        "El LSTM usa LAI y NPP_3PG derivados exclusivamente de MODIS_NDVI, reproduciendo el régimen con que se ajustó el modelo.",
        f"Métricas del modelo corresponden a 'ajuste' (datos de entrenamiento n=86). "
        f"La media observada 2002-2011 es de +{media_obs_val:.2f} gC m-2 d-1 (emisión neta histórica en la torre).",
        "El KPI 'NPP' proviene de una fórmula analítica (no de un modelo de machine learning). "
        "NPP_3PG se satura en el piso de 0.1 en el 72% de los meses por definición fisiológica.",
        "Los años ≥ 2012 corresponden a estimaciones con forzantes climáticos ERA5 sin verdad terreno de flujos."
    ]

    if cl or qu:
        notes.append(f"El manejo (clareo {cl}%, quema {qu}%) redujo la vegetación efectiva: "
                     f"Rama combinada NDVI {scen['ndvi_ef']:.2f}/LAI {scen['lai_ef']:.2f}; "
                     f"Rama MODIS NDVI {scen['modis_ndvi_ef']:.2f}/LAI {scen['modis_lai_ef']:.2f}.")

    return {
        "gestion": {"clareo_pct": cl, "quema_pct": qu, "restauracion_plantas_ha": res, "manejo_combustibles": fuel},
        "vegetacion_efectiva": {
            "ndvi_combinado": round(scen["ndvi_ef"], 3),
            "lai_combinado": round(scen["lai_ef"], 3),
            "modis_ndvi": round(scen["modis_ndvi_ef"], 3),
            "modis_lai": round(scen["modis_lai_ef"], 3),
            "npp_3pg_lstm": round(f["lstm"][0], 3)
        },
        "ventana_lstm": {"meses": [f"{y}-{m:02d}" for y, m in fechas_ventana], "descripcion": f"t-4..t-1 ({str_ventana})"},
        "origen_estado": scen["origen"],
        "modelos": modelos,
        "interpretaciones": notes
    }


def _fmt_num(x, nd=2):
    try:
        return "-" if x is None else f"{float(x):.{nd}f}"
    except (TypeError, ValueError):
        return str(x)


def _prompt_explicacion(scen, sim):
    """Compone el prompt para Gemini incorporando las reglas de lenguaje y contexto de ajuste."""
    g = [("Clareo", "clareo_pct", 0, "%"), ("Quema", "quema_pct", 0, "%"),
         ("Restauracion", "restauracion_plantas_ha", 0, "pl/ha"),
         ("Manejo de combustibles", "manejo_combustibles", 0, "%"),
         ("Temperatura", "temperatura_c", 26.0, "C")]
    esc = " | ".join(f"{n} {_fmt_num(_par(scen, k, d), 1)}{u}".strip() for n, k, d, u in g)
    base, cur, delta = sim.get("baseline", {}), sim.get("scenario", {}), sim.get("delta", {})
    kpis = []
    for k, label, unit in (("biomasa", "Biomasa", "Mg/ha"), ("npp", "NPP (fórmula analítica)", "Mg C/ha/año"),
                           ("riesgo", "Riesgo de incendio", "probabilidad"),
                           ("nee", "NEE (balance neto de carbono, ajuste)", "gC m-2 d-1")):
        kpis.append(f"- {label}: linea base {_fmt_num(base.get(k))} -> escenario "
                    f"{_fmt_num(cur.get(k))} (delta {_fmt_num(delta.get(k))}) {unit}".strip())
    traza = []
    for m in sim.get("insumos", {}).get("modelos", []):
        preds = ", ".join(f"{p.get('nombre')}={_fmt_num(p.get('valor'), 3)} {p.get('unidad', '')}".strip()
                          for p in m.get("predictoras", []))
        traza.append(f"- {m.get('objetivo')} ({m.get('modelo')}, {m.get('tipo')}): analizó {preds}; "
                     f"devolvió {_fmt_num(m.get('resultado'), 3)} {m.get('unidad', '')}".strip())
    notas = "\n".join(f"- {n}" for n in sim.get("insumos", {}).get("interpretaciones", []))
    sv = sim.get("source_version", "desconocida")
    estado_origen = sim.get("estado_origen", "desconocido")
    ultimo_mes = sim.get("ultimo_mes_completo", "desconocido")

    obs = _observaciones()
    media_obs = "+0.86"
    if obs and "metadata" in obs and "nee_observado" in obs["metadata"]:
        media_obs = f"+{obs['metadata']['nee_observado'].get('media', 0.86):.2f}"

    return (
        "Eres un divulgador forestal y científico. Explica en lenguaje sencillo y riguroso esta inferencia "
        "de un gemelo digital forestal (sitio BR-Sa1, Floresta Nacional do Tapajós).\n\n"
        "REGLAS OBLIGATORIAS DE LENGUAJE:\n"
        "1. NO usar 'validación' ni 'precisión' sin la palabra 'ajuste' (las métricas corresponden a ajuste in-sample).\n"
        f"2. La media observada en la torre FLUXNET 2002-2011 es {media_obs} gC m-2 d-1 (emisión neta histórica).\n"
        "3. El NEE positivo representa emisión neta a la atmósfera; negativo representa sumidero.\n"
        "4. El LAI para el modelo NEE utiliza el régimen MODIS con ventana previa t-4..t-1.\n"
        "5. NO presentar NPP_3PG como productividad del bosque (está en el piso del 0.1 en 72% de meses). El KPI 'NPP' sale de una fórmula analítica.\n"
        "6. Los años ≥ 2012 son salidas del modelo con forzantes climáticos ERA5 sin verdad terreno de flujos, no un pronóstico climático.\n\n"
        f"## Escenario simulado\n{esc}\n"
        f"Estado base: {estado_origen} | Último mes completo del estado: {ultimo_mes}\n\n"
        f"## Resultado de la inferencia (modelos entrenados, fuente {sv})\n" + "\n".join(kpis) + "\n\n"
        "## Qué analizó cada modelo y ramas de entrada\n" + ("\n".join(traza) or "- sin traza disponible") + "\n\n"
        "## Notas e interpretaciones del gemelo\n" + (notas or "- sin notas")
    )


def _gemini(prompt):
    model = GEMINI_MODEL or "gemini-2.0-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 4096}}
    try:
        r = requests.post(url, params={"key": GEMINI_API_KEY}, json=body, timeout=90)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"No se pudo contactar a Gemini ({e.__class__.__name__}).")
    if r.status_code != 200:
        det = ""
        try:
            det = r.json().get("error", {}).get("message", "")
        except Exception:
            pass
        raise HTTPException(status_code=502,
                            detail=f"Gemini respondió error {r.status_code}: {det}".strip().rstrip(":"))
    try:
        data = r.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        raise HTTPException(status_code=502, detail="Gemini no devolvió un texto utilizable.")


# ---------------------------------------------------------------------------
# Endpoints de la API
# ---------------------------------------------------------------------------

@app.get('/metricas-articulo')
def metricas_articulo():
    """Lista tablas, figuras y metadatos publicables del artículo."""
    if not METRICAS_ARTICULO_DIR.exists():
        raise HTTPException(status_code=404, detail="Carpeta de métricas del artículo no disponible")

    archivos = []
    for path in sorted(METRICAS_ARTICULO_DIR.iterdir()):
        if not path.is_file() or path.suffix.lower() not in {".csv", ".png", ".json"}:
            continue
        titulo, descripcion = METRICAS_ARTICULO_DESCRIPCIONES.get(
            path.name,
            (path.stem.replace("_", " ").title(), "Archivo generado para documentar los resultados y métricas del artículo.")
        )
        tipo = "figura" if path.suffix.lower() == ".png" else "tabla" if path.suffix.lower() == ".csv" else "metadatos"
        archivos.append({
            "nombre": path.name,
            "tipo": tipo,
            "titulo": titulo,
            "descripcion": descripcion,
            "tamano_bytes": path.stat().st_size,
            "url": f"/metricas-articulo/archivo/{path.name}",
        })
    return {"directorio": "modelos_entrenados/metricas_articulo", "archivos": archivos}


@app.get('/metricas-articulo/archivo/{nombre}')
def archivo_metrica_articulo(nombre: str):
    """Sirve un CSV, figura o JSON del directorio de métricas sin permitir salir de él."""
    path = (METRICAS_ARTICULO_DIR / nombre).resolve()
    if path.parent != METRICAS_ARTICULO_DIR.resolve() or not path.is_file() or path.suffix.lower() not in {".csv", ".png", ".json"}:
        raise HTTPException(status_code=404, detail="Archivo de métricas no disponible")
    if path.suffix.lower() == ".csv":
        return PlainTextResponse(path.read_text(encoding="utf-8-sig"), media_type="text/csv")
    return FileResponse(path)

@app.get('/observaciones')
def observaciones():
    """Sirve el JSON completo de observaciones de flujos y climatología."""
    obs = _observaciones()
    if obs is None:
        raise HTTPException(status_code=404, detail="Archivo de observaciones no disponible")
    return {k: v for k, v in obs.items() if not k.startswith("_")}


@app.get('/validacion')
def validacion():
    """Sirve el JSON de validación, métricas de ajuste y paridad del gemelo."""
    val = _validacion()
    if val is None:
        raise HTTPException(status_code=404, detail="Archivo de validación no disponible")
    return val


@app.get('/modelo/mejor')
def mejor():
    """Devuelve metadatos del mejor modelo con métricas etiquetadas como 'ajuste'."""
    art = _artefactos()
    val = _validacion()

    # Métricas de ajuste reales de metricas_ajuste["todos (incluye marcadas)"]
    metricas = {"r2": 0.571, "rmse": 0.690, "mae": 0.561, "n": 86}
    etiqueta = "ajuste (datos de entrenamiento)"
    if val and "metricas_ajuste" in val:
        todos = val["metricas_ajuste"].get("todos (incluye marcadas)", {})
        metricas = {
            "r2": todos.get("r2", 0.571),
            "rmse": todos.get("rmse", 0.690),
            "mae": todos.get("mae", 0.561),
            "sesgo": todos.get("sesgo_pred_menos_obs"),
            "r_pearson": todos.get("r_pearson"),
            "n": todos.get("n", 86)
        }
        etiqueta = val.get("metadata", {}).get("etiqueta", "AJUSTE (no es validación independiente)")

    try:
        import json
        b = json.loads(art["best"]) if art["best"] else {}
        return {
            "nombre": b.get("mejor_modelo", "3PG_LSTM"),
            "tipo": b.get("tipo", "hibrido_fisiologico_lstm"),
            "objetivo": b.get("objetivo", "NEE"),
            "etiqueta": etiqueta,
            "metricas": metricas,
            "validacion_cruzada": b.get("validacion_cruzada"),
            "variables_predictoras": b.get("variables_predictoras"),
            "hiperparametros": b.get("hiperparametros"),
            "source_version": b.get("fuente_version", _fuente()),
            "fecha": b.get("fecha_seleccion")
        }
    except Exception:
        return {
            "nombre": "3-PG + LSTM",
            "etiqueta": etiqueta,
            "metricas": metricas,
            "source_version": SOURCE_VERSION,
            "fecha": datetime.now().isoformat()
        }


@app.get('/diccionario')
def diccionario():
    """Devuelve rangos de variables usados por los controles del laboratorio."""
    return {
        "clareo_pct": {"unit": "%", "min": 0, "max": 60},
        "quema_pct": {"unit": "%", "min": 0, "max": 50},
        "restauracion_plantas_ha": {"unit": "pl/ha", "min": 0, "max": 500},
        "manejo_combustibles": {"unit": "%", "min": 0, "max": 100},
        "precipitacion_mm": {"unit": "mm", "min": 0, "max": 500},
        "temperatura_c": {"unit": "C", "min": 15, "max": 35}
    }


@app.post('/simular')
def simular(payload: dict):
    """Ejecuta una inferencia what-if con los modelos entrenados reales.
    Año por defecto: 2025 (último año con estado en serie).
    """
    year = int(_par(payload, "year", 2025))
    month = int(_par(payload, "month", 9))

    scen, neutro = _escenarios(payload, year, month)
    art = _artefactos()
    cur = _resumen(scen, art, year, month)
    base = _resumen(neutro, art, year, month)

    # Temporal: 12 meses del año del escenario, con biomasa, riesgo y NEE base + escenario
    temporal = []
    for i in range(1, 13):
        sc_m = _resumen(scen, art, year, i)
        bc_m = _resumen(neutro, art, year, i)
        temporal.append({
            "period": f"{year}-{i:02d}",
            "baseline": bc_m["biomasa"],
            "scenario": sc_m["biomasa"],
            "riesgo_base": bc_m["riesgo"],
            "riesgo_escenario": sc_m["riesgo"],
            "nee_base": bc_m["nee"],
            "nee_escenario": sc_m["nee"],
        })

    parcela = _datos_parcela()
    terreno = parcela.get("terreno") if parcela else None
    meta_parc = parcela.get("metadata") if parcela else None

    # Trazabilidad y origen del estado base
    eb = _estado_base()
    reg = eb["_serie_idx"].get((year, month)) if eb else None
    if reg is not None and reg.get("completo_todos", False):
        estado_origen = reg.get("origen", "serie")
    elif reg is not None:
        estado_origen = f"serie_parcial (fallback climatologia mes {month})"
    elif eb is not None:
        estado_origen = f"climatologia (mes {month}, sin serie para {year})"
    else:
        estado_origen = "sintetica"

    ultimo_mes_completo = eb["metadata"].get("ultimo_mes_completo", "2025-12") if eb else "desconocido"
    ultimo_mes_entrenamiento = eb["metadata"].get("ultimo_mes_entrenamiento", "2023-12") if eb else "desconocido"
    in_sample = reg.get("en_entrenamiento", False) if reg else False

    # Bloque de referencia: datos observados de la torre para este mes
    obs = _observaciones()
    clim_obs = obs["_clim_idx"].get(month, {}) if obs else {}
    obs_reg = obs["_serie_idx"].get((year, month), {}) if obs else {}

    referencia = {
        "media_observada_mes": clim_obs.get("nee_media"),
        "desviacion_observada_mes": clim_obs.get("nee_sd"),
        "tiene_observacion": bool(obs_reg.get("tiene_observacion", False)),
        "valor_observado": obs_reg.get("nee_obs"),
        "calidad": obs_reg.get("nee_qc"),
        "incertidumbre": obs_reg.get("nee_incert"),
        "baja_calidad": obs_reg.get("baja_calidad"),
        "indicador_dato_entrenamiento": in_sample or bool(obs_reg.get("tiene_observacion", False)),
        "origen_estado": estado_origen,
        "ultimo_mes_estado_base": ultimo_mes_completo,
        "regimen_lai": "MODIS_NDVI",
    }

    return {
        "source_version": _fuente(),
        "modelos": {"biomasa": "AGB_GEDI" if art["agb"] else "sintetico",
                    "riesgo": "INCENDIO" if art["incendio"] else "sintetico",
                    "nee": "3PG_LSTM" if _lstm_ok() else "no disponible"},
        "estado_origen": estado_origen,
        "ultimo_mes_completo": ultimo_mes_completo,
        "ultimo_mes_entrenamiento": ultimo_mes_entrenamiento,
        "in_sample": in_sample,
        "baseline": base,
        "scenario": cur,
        "delta": {"biomasa": cur["biomasa"] - base["biomasa"],
                  "npp": cur["npp"] - base["npp"],
                  "riesgo": cur["riesgo"] - base["riesgo"],
                  "nee": cur["nee"] - base["nee"]
                  if cur["nee"] is not None and base["nee"] is not None else None},
        "insumos": _insumos(scen, year, month, cur, base, art, payload),
        "referencia": referencia,
        "temporal": temporal,
        "trees": _trees(cur["riesgo"], cur["biomasa"]),
        "terreno": terreno,
        "metadata_parcela": meta_parc,
    }


@app.post('/reporte')
def reporte(payload: dict):
    """Devuelve un resumen trazable listo para ser consumido por un generador PDF/Excel."""
    return {"generated_at": datetime.now().isoformat(), "source_version": SOURCE_VERSION, "payload": payload}


@app.get('/explicar/estado')
def explicar_estado():
    """Indica si el servidor tiene configurada la llave de Gemini."""
    return {"configurado": bool(GEMINI_API_KEY)}


@app.post('/explicar')
def explicar(payload: dict):
    """Explica en lenguaje sencillo qué significa la inferencia usando Gemini."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=400,
                            detail="GEMINI_API_KEY no está configurada en el servidor (revisa el archivo .env).")
    sim = payload.get("simulation")
    scen = payload.get("escenario") if payload.get("escenario") is not None else {}
    if not isinstance(sim, dict) or any(k not in sim for k in ("baseline", "scenario", "delta")):
        raise HTTPException(status_code=400, detail="Faltan los datos de la simulación (simulation).")
    return {"explicacion": _gemini(_prompt_explicacion(scen, sim))}