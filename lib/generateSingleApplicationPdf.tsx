import { Application } from "./types/applications";
import { generateApplicationPdf, type GeneratedPdfResult } from "./applications/pdf";

export async function generateSingleApplicationPdf(
  app: Application,
): Promise<GeneratedPdfResult> {
  return generateApplicationPdf(app);
}
