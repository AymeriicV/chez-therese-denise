from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["realtime"])


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, restaurant_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.setdefault(restaurant_id, []).append(websocket)

    def disconnect(self, restaurant_id: str, websocket: WebSocket) -> None:
        sockets = self.connections.get(restaurant_id, [])
        if websocket in sockets:
            sockets.remove(websocket)

    async def broadcast(self, restaurant_id: str, message: dict) -> None:
        for websocket in self.connections.get(restaurant_id, []):
            await websocket.send_json(message)


manager = ConnectionManager()


@router.websocket("/ws/{restaurant_id}")
async def websocket_endpoint(websocket: WebSocket, restaurant_id: str):
    await manager.connect(restaurant_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(restaurant_id, websocket)
