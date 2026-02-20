export function isHostSocket(game, ws) {
  const hostPlayer = game.players?.find((p) => p.username === game.host);
  return hostPlayer && hostPlayer.id === ws.id;
}

export function requireHost(game, ws) {
  return game && isHostSocket(game, ws);
}
