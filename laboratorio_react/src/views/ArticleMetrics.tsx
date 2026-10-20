import { useEffect, useMemo, useState } from 'react';
import { getMetricasArticulo, metricasArticuloUrl } from '../services/api';
import type { MetricaArticuloArchivo } from '../types';

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function ArticleMetricsView() {
  const [files, setFiles] = useState<MetricaArticuloArchivo[]>([]);
  const [error, setError] = useState('');
  const [selectedCsv, setSelectedCsv] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState('');

  useEffect(() => {
    getMetricasArticulo()
      .then((data) => setFiles(data.archivos))
      .catch((e: Error) => setError(e.message));
  }, []);

  const figures = useMemo(() => files.filter((file) => file.tipo === 'figura'), [files]);
  const tables = useMemo(() => files.filter((file) => file.tipo === 'tabla'), [files]);
  const metadata = useMemo(() => files.filter((file) => file.tipo === 'metadatos'), [files]);

  const showCsv = async (file: MetricaArticuloArchivo) => {
    if (selectedCsv === file.nombre) {
      setSelectedCsv(null);
      return;
    }
    const response = await fetch(metricasArticuloUrl(file.url));
    if (!response.ok) {
      setError(`No se pudo leer ${file.nombre}.`);
      return;
    }
    setCsvContent((await response.text()).split('\n').slice(0, 15).join('\n'));
    setSelectedCsv(file.nombre);
  };

  const renderFileLink = (file: MetricaArticuloArchivo) => (
    <a className="article-download" href={metricasArticuloUrl(file.url)} download={file.nombre}>
      Descargar
    </a>
  );

  return (
    <section className="article-metrics">
      <div className="panel article-heading">
        <div>
          <h2>Métricas del artículo</h2>
          <p className="muted">
            Tablas, figuras y archivos de soporte publicados en <b>modelos_entrenados/metricas_articulo</b>.
          </p>
        </div>
        <button className="primary" type="button" onClick={() => window.print()}>Exportar página a PDF</button>
      </div>

      {error && <div className="api-error-banner" role="alert">⚠ {error}</div>}
      {!error && files.length === 0 && <div className="panel empty">Cargando métricas del artículo…</div>}

      {figures.length > 0 && (
        <div className="panel article-section">
          <h3>Figuras</h3>
          <div className="article-figures">
            {figures.map((file) => (
              <article className="article-figure" key={file.nombre}>
                <img src={metricasArticuloUrl(file.url)} alt={file.titulo} />
                <div className="article-card-body">
                  <h4>{file.titulo}</h4>
                  <p>{file.descripcion}</p>
                  <small>{file.nombre} · {formatSize(file.tamano_bytes)}</small>
                  {renderFileLink(file)}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {tables.length > 0 && (
        <div className="panel article-section">
          <h3>Tablas y archivos CSV</h3>
          <div className="article-file-list">
            {tables.map((file) => (
              <article className="article-file" key={file.nombre}>
                <div>
                  <h4>{file.titulo}</h4>
                  <p>{file.descripcion}</p>
                  <small>{file.nombre} · {formatSize(file.tamano_bytes)}</small>
                </div>
                <div className="article-actions">
                  <button type="button" onClick={() => void showCsv(file)}>
                    {selectedCsv === file.nombre ? 'Ocultar vista previa' : 'Ver CSV'}
                  </button>
                  {renderFileLink(file)}
                </div>
                {selectedCsv === file.nombre && <pre className="csv-preview">{csvContent}</pre>}
              </article>
            ))}
          </div>
        </div>
      )}

      {metadata.length > 0 && (
        <div className="panel article-section article-metadata">
          <h3>Metadatos y configuraciones</h3>
          {metadata.map((file) => (
            <div className="article-file" key={file.nombre}>
              <div><h4>{file.titulo}</h4><p>{file.descripcion}</p><small>{file.nombre} · {formatSize(file.tamano_bytes)}</small></div>
              {renderFileLink(file)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
