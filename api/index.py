"""A single portable Python endpoint for Vercel and local development."""

from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import json

from api.service import overview, search_materials, material_detail, simulate


ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / 'data' / 'caliber.sqlite'
REPORT = ROOT / 'data' / 'model_report.json'


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        route = params.get('route', ['overview'])[0]
        try:
            if route == 'overview':
                result = overview(DB, REPORT)
            elif route == 'materials':
                result = search_materials(DB, params.get('q', [''])[0], params.get('limit', ['20'])[0])
            elif route == 'material':
                result = material_detail(DB, params.get('id', [''])[0])
            else:
                return self._send(404, {'error': 'Unknown API route'})
            self._send(200, result)
        except KeyError:
            self._send(404, {'error': 'Material not found'})
        except (ValueError, TypeError) as error:
            self._send(400, {'error': str(error)})

    def do_POST(self):
        params = parse_qs(urlparse(self.path).query)
        if params.get('route', [''])[0] != 'scenario':
            return self._send(404, {'error': 'Unknown API route'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size > 20000:
                raise ValueError('Scenario request is too large')
            body = json.loads(self.rfile.read(size))
            result = simulate(DB, body['material_id'], body.get('scenario', {}))
            self._send(200, result)
        except KeyError as error:
            self._send(404 if str(error) != "'material_id'" else 400,
                       {'error': 'Material not found' if str(error) != "'material_id'" else 'material_id is required'})
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self._send(400, {'error': str(error)})


if __name__ == '__main__':
    print('API listening at http://localhost:8000/api')
    HTTPServer(('127.0.0.1', 8000), handler).serve_forever()
