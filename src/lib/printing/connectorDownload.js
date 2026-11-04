// Descarga del Walinka Print Connector según dónde corre Walinka.
//
// Producción sigue con la versión estable; solo las Previews de Vercel de
// este proyecto ofrecen la versión nueva. Así, este archivo puede llegar a
// main sin cambiar lo que descargan los comercios hasta que se mueva
// `stable` a propósito.
//
// Los instaladores se publican como GitHub Releases (pre-release) desde el
// workflow `print-connector-installer.yml`. El SHA-256 es el que muestra el
// release y su SHA256SUMS.txt.

const RELEASES_BASE = 'https://github.com/JotaceGaete/saas/releases';

function release(version, sha256) {
  const tag = `print-connector-v${version}`;
  const file = `WalinkaPrintConnector-Setup-${version}.exe`;
  return Object.freeze({
    version,
    file,
    sha256,
    url: `${RELEASES_BASE}/download/${tag}/${file}`,
    releaseUrl: `${RELEASES_BASE}/tag/${tag}`,
  });
}

export const CONNECTOR_RELEASES = Object.freeze({
  stable: release('0.3.0', '88e6fdb59ce88a2e56c223591048aead731089fd4f424bfe6df50a6d67edad1c'),
  preview: release('0.4.0', '923bbc7e75b2b95e76b0b88545857250aac2481aa1e6f627b423a203c336b8a1'),
});

// Igual que PreviewOrigins.IsApprovable del conector (OriginApproval.cs).
const PREVIEW_ORIGIN = /^https:\/\/saas-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-juan-s-projects-afd7e18e\.vercel\.app$/;

export function isWalinkaPreviewOrigin(origin) {
  if (typeof origin !== 'string' || !PREVIEW_ORIGIN.test(origin)) return false;
  const firstLabel = origin.slice('https://'.length).split('.')[0];
  return firstLabel.length <= 63;
}

/** Instalador que corresponde a este sitio: la versión nueva solo en Previews. */
export function connectorDownloadFor(origin) {
  return isWalinkaPreviewOrigin(origin) ? CONNECTOR_RELEASES.preview : CONNECTOR_RELEASES.stable;
}

/** Comando para comprobar el SHA-256 en Windows (Símbolo del sistema, en Descargas). */
export function checksumCommand(download) {
  return `certutil -hashfile ${download.file} SHA256`;
}
