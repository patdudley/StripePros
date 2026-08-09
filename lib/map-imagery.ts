import type { Map as LeafletMap, TileLayer } from "leaflet";

export function activateTileLayer(
  map: LeafletMap,
  nextLayer: TileLayer,
  currentLayer: TileLayer | null,
  timeoutMs = 4500,
) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let tileErrors = 0;

    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      nextLayer.off("tileload", handleTileLoad);
      nextLayer.off("tileerror", handleTileError);

      if (loaded) {
        if (currentLayer && currentLayer !== nextLayer && map.hasLayer(currentLayer)) map.removeLayer(currentLayer);
      } else if (map.hasLayer(nextLayer)) {
        map.removeLayer(nextLayer);
      }
      resolve(loaded);
    };

    const handleTileLoad = () => finish(true);
    const handleTileError = () => {
      tileErrors += 1;
      if (tileErrors >= 3) finish(false);
    };
    const timeout = window.setTimeout(() => finish(false), timeoutMs);

    nextLayer.on("tileload", handleTileLoad);
    nextLayer.on("tileerror", handleTileError);
    nextLayer.addTo(map);
  });
}
