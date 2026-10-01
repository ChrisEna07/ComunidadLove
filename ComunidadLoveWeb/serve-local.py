"""
Servidor estatico local para Comunidad Love (sin dependencias).

Uso:  python serve-local.py [puerto]

Reproduce lo que hace Firebase Hosting en el `firebase.json`: sirve la raiz
del proyecto, resuelve directorios a index.html y redirige `/admin` a
`/admin/index.html`. Los módulos ES exigen `Content-Type: text/javascript`,
asi que los tipos se fijan de forma explicita.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 5173

TEXT_SUFFIXES = {".html", ".css", ".js", ".mjs", ".json", ".svg", ".webmanifest"}

CONTENT_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".webmanifest": "application/manifest+json",
}


class Handler(SimpleHTTPRequestHandler):
    """Sirve la raiz del proyecto con rutas limpias y sin listar directorios."""

    def check_utf8(self, path):
        """Los archivos de texto se abren con `encoding="utf-8"`.

        El cuerpo se sirve en bytes para no alterar el contenido, pero asi se
        detecta cualquier archivo que se haya guardado con otra codificacion.
        """
        if Path(str(path)).suffix.lower() not in TEXT_SUFFIXES:
            return
        try:
            with open(path, encoding="utf-8") as handle:
                handle.read()
        except UnicodeDecodeError as error:
            sys.stderr.write(f"[UTF-8] {path}: {error}\n")

    def guess_type(self, path):
        suffix = Path(str(path)).suffix.lower()
        if suffix in CONTENT_TYPES:
            self.check_utf8(path)
            return CONTENT_TYPES[suffix]
        return super().guess_type(path)

    def send_head(self):
        # `/admin` sin barra final lo manda a su index.html, igual que
        # el rewrite "/admin" -> "/admin/index.html" de firebase.json.
        # Solo en la forma exacta: aplicar la redireccion tambien a `/admin/`
        # (self.path ya con barra) provocaria un bucle infinito.
        if self.path == "/admin":
            self.send_response(301)
            self.send_header("Location", "/admin/")
            self.end_headers()
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404, "Not Found")
        return None

    def end_headers(self):
        # Durante las pruebas interesa recargar siempre los módulos.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            sys.stderr.write("[404] %s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    handler = partial(Handler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Comunidad Love servida en http://localhost:{port}/")
    print(f"  Landing publica : http://localhost:{port}/")
    print(f"  Panel admin     : http://localhost:{port}/admin/")
    print("Ctrl+C para detener.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()