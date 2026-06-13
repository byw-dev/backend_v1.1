from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.clients = []

    async def connect(self, websocket: WebSocket, user: dict = None):
        await websocket.accept()
        self.clients.append({'websocket': websocket, 'user': user or {}})

    def disconnect(self, websocket: WebSocket):
        self.clients = [item for item in self.clients if item.get('websocket') is not websocket]

    async def broadcast(self, message: dict, prepare=None):
        dead = []
        for item in list(self.clients):
            ws = item.get('websocket')
            try:
                payload = prepare(message, item.get('user')) if prepare else message
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)
