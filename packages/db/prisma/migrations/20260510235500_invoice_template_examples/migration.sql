-- Add GPT-learned structured examples for supplier invoice OCR.
ALTER TABLE "SupplierInvoiceTemplate"
ADD COLUMN "exampleRows" JSONB;
