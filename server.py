"""로컬 개발 서버: 정적 파일 + /api/vworld 프록시(Vercel 함수와 같은 동작).

사용: set VWORLD_KEY=키  /  set VWORLD_DOMAIN=http://localhost  후  python server.py [포트]
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DATA = "https://api.vworld.kr/req/data"
ADDRESS = "https://api.vworld.kr/req/address"
NUM = re.compile(r"^-?\d+(\.\d+)?$")


def build_url(q, key, domain):
    if q.get("kind") == "data":
        layer = q.get("layer", "")
        if not re.fullmatch(r"[A-Z0-9_]+", layer):
            raise ValueError("layer 형식 오류")
        box = q.get("bbox", "").split(",")
        if len(box) != 4 or not all(NUM.match(v) for v in box):
            raise ValueError("bbox 형식 오류")
        size = min(int(q.get("size", 1000)), 1000)
        page = max(int(q.get("page", 1)), 1)
        p = {"service": "data", "request": "GetFeature", "data": layer, "key": key,
             "geomFilter": "BOX(" + q["bbox"] + ")", "crs": "EPSG:4326", "size": size,
             "page": page, "format": "json", "domain": domain}
        return DATA + "?" + urllib.parse.urlencode(p)
    if q.get("kind") == "geocode":
        addr = q.get("address", "")
        if not addr or len(addr) > 200:
            raise ValueError("address 오류")
        p = {"service": "address", "request": "getCoord", "version": "2.0", "crs": "epsg:4326",
             "address": addr, "refine": "true", "simple": "false", "format": "json",
             "type": "PARCEL" if q.get("type") == "PARCEL" else "ROAD", "key": key, "domain": domain}
        return ADDRESS + "?" + urllib.parse.urlencode(p)
    raise ValueError("kind 는 data 또는 geocode")


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/api/vworld":
            return super().do_GET()
        key = os.environ.get("VWORLD_KEY")
        if not key:
            return self.reply(500, {"error": "VWORLD_KEY 환경변수가 없습니다."})
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            url = build_url(q, key, os.environ.get("VWORLD_DOMAIN", ""))
            with urllib.request.urlopen(url, timeout=20) as r:
                self.reply(200, json.load(r))
        except Exception as e:
            self.reply(400, {"error": str(e).replace(key, "***")})

    def end_headers(self):  # 개발 서버: 정적 파일이 캐시되어 예전 화면이 보이는 것을 막는다
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # 요청 로그에 주소·키가 남지 않도록 출력하지 않는다
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8794
    print(f"http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
