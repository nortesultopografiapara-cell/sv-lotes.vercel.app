import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { displayContractNumber } from "@/lib/contractNumber";
import {
  flowDisplayLabel,
  formatFlowDate,
  type CashFlowItem,
} from "@/lib/financeCashFlow";
import { getReceiptValidationUrl } from "@/lib/pdfValidation";

export type ExpenseReceiptPdfInput = {
  item: CashFlowItem;
  tenantData: {
    razao_social?: string;
    name?: string;
    cnpj?: string;
    logo_url?: string;
  } | null;
  receiptNumber: string;
  validationCode: string;
};

async function loadLogoBase64(url: string): Promise<string | null> {
  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = url;
    });
  } catch {
    return null;
  }
}

function fieldOrDash(value: string, manual = false): string {
  const v = flowDisplayLabel(value, manual);
  return v === "Lançamento manual" ? "—" : v;
}

export async function generateExpenseReceiptPdf(
  input: ExpenseReceiptPdfInput,
): Promise<jsPDF> {
  const { item, tenantData, receiptNumber, validationCode } = input;
  const doc = new jsPDF("portrait", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const companyName = (
    tenantData?.razao_social ||
    tenantData?.name ||
    "SV LOTES"
  ).toUpperCase();
  const validationUrl = getReceiptValidationUrl(validationCode);
  const issuedAt = new Date().toLocaleString("pt-BR");

  let y = 24;

  doc.setFillColor(19, 22, 28);
  doc.rect(0, 0, pageWidth, 88, "F");

  const logo = tenantData?.logo_url
    ? await loadLogoBase64(tenantData.logo_url)
    : null;
  if (logo) {
    doc.addImage(logo, "PNG", 40, 18, 52, 28, undefined, "FAST");
    y = 52;
  }

  const textX = logo ? 100 : 40;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(companyName, textX, 32);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (tenantData?.cnpj) {
    doc.text(`CNPJ: ${tenantData.cnpj}`, textX, 44);
  }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("RECIBO DE PAGAMENTO", textX, 58);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº ${receiptNumber}`, pageWidth - 40, 32, { align: "right" });
  doc.text(`Emitido: ${issuedAt}`, pageWidth - 40, 42, { align: "right" });

  y = 108;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  const legalText =
    "Recebemos/Pagamos a importância referente à despesa abaixo descrita.";
  doc.text(legalText, 40, y, { maxWidth: pageWidth - 80 });

  y += 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(41, 128, 185);
  const valorStr = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(item.amount);
  doc.text(valorStr, 40, y);

  const contrato =
    item.contractNumber && item.contractNumber !== "Lançamento manual"
      ? displayContractNumber(item.contractNumber)
      : "—";

  const rows: [string, string][] = [
    ["Data do pagamento", formatFlowDate(item.movement_date)],
    ["Categoria", item.category],
    ["Descrição", item.description || "—"],
    ["Projeto / Loteamento", fieldOrDash(item.projectName, item.isManual)],
    ["Cliente", fieldOrDash(item.customerName, item.isManual)],
    ["Corretor", fieldOrDash(item.brokerName, item.isManual)],
    ["Contrato", contrato],
    ["Quadra / Lote", fieldOrDash(item.locationLabel, item.isManual)],
    ["Código de validação", validationCode],
  ];

  autoTable(doc, {
    startY: y + 16,
    head: [["Campo", "Informação"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [52, 73, 94], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 40, right: 40 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable?.finalY ?? y + 120;

  let qrBase64: string | null = null;
  try {
    qrBase64 = await QRCode.toDataURL(validationUrl, { margin: 1, width: 256 });
  } catch {
    qrBase64 = null;
  }

  const blockY = finalY + 24;
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(40, blockY, pageWidth - 40, blockY);

  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.setFont("helvetica", "normal");
  doc.text("Escaneie para validar a autenticidade deste recibo", 40, blockY + 14);

  if (qrBase64) {
    doc.addImage(qrBase64, "PNG", pageWidth - 120, blockY + 4, 72, 72);
  }

  const signY = blockY + 90;
  doc.setTextColor(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Assinatura / Responsável", 40, signY);
  doc.setDrawColor(100);
  doc.line(40, signY + 28, 220, signY + 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(companyName, 40, signY + 40);
  doc.setTextColor(120);
  doc.setFontSize(7);
  doc.text(
    "Documento gerado digitalmente pelo SV LOTES — Gestão Imobiliária",
    40,
    signY + 52,
  );

  return doc;
}
