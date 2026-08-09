import type { PolygonGeometry, TakeoffAnnotation } from "./types";

export type DetectionRequest = { address: string; boundary: PolygonGeometry; imageryProvider: string };
export type DetectionResult = { configured: boolean; message: string; annotations: TakeoffAnnotation[] };

export interface LotDetectionProvider {
  detect(request: DetectionRequest): Promise<DetectionResult>;
}

export class UnconfiguredLotDetectionProvider implements LotDetectionProvider {
  async detect(request: DetectionRequest): Promise<DetectionResult> {
    void request;
    return {
      configured: false,
      message: "Automatic detection is not configured. Continue with manual takeoff.",
      annotations: [],
    };
  }
}

export const lotDetectionProvider: LotDetectionProvider = new UnconfiguredLotDetectionProvider();
