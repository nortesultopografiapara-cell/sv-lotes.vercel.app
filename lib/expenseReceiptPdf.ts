import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { displayContractNumber } from "@/lib/contractNumber";
import { formatFlowDate, type CashFlowItem } from "@/lib/financeCashFlow";
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
  paymentMethod?: string;
};

function displayReceiptField(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (
    !v ||
    v === "-" ||
    v === "Lançamento manual" ||
    v.toLowerCase() === "s/n"
  ) {
    return "Não informado";
  }
  return v;
}

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

function formatBrl(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

export async function generateExpenseReceiptPdf(
  input: ExpenseReceiptPdfInput,
): Promise<jsPDF> {
  const { item, tenantData, receiptNumber, validationCode, paymentMethod } =
    input;
  const doc = new jsPDF("portrait", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  const companyName = (
    tenantData?.razao_social ||
    tenantData?.name ||
    "S.V TOPOGRAFIA E PROJETOS LTDA"
  ).toUpperCase();
  const companyCnpj = tenantData?.cnpj || "Não informado";
  const validationUrl = getReceiptValidationUrl(validationCode);
  const issuedAt = new Date().toLocaleString("pt-BR");
  const paymentDate = formatFlowDate(item.movement_date);
  const valorStr = formatBrl(item.amount);
  const descricao = displayReceiptField(item.description);

  const contratoRaw =
    item.contractNumber && item.contractNumber !== "Lançamento manual"
      ? displayContractNumber(item.contractNumber)
      : "";
  const contrato = displayReceiptField(contratoRaw);
  const beneficiario = displayReceiptField(
    item.brokerName || item.customerName,
  );

  doc.setFillColor(19, 22, 28);
  doc.rect(0, 0, pageWidth, 96, "F");

  const logo = tenantData?.logo_url
    ? await loadLogoBase64(tenantData.logo_url)
    : null;
  const headerTextX = logo ? 104 : margin;

  if (logo) {
    doc.addImage(logo, "PNG", margin, 20, 56, 30, undefined, "FAST");
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(companyName, headerTextX, 34);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`CNPJ: ${companyCnpj}`, headerTextX, 46);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("RECIBO DE PAGAMENTO", headerTextX, 60);
  doc.setFontSize(8);
  doc.text("SAÍDA — Comprovante de pagamento realizado pela empresa", headerTextX, 70);

  doc.text(`Nº ${receiptNumber}`, pageWidth - margin, 34, { align: "right" });
  doc.text(`Emitido: ${issuedAt}`, pageWidth - margin, 44, { align: "right" });

  let y = 112;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("RECIBO DE PAGAMENTO / SAÍDA", margin, y);

  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const declaracao = `Declaramos para os devidos fins que ${companyName} realizou o pagamento no valor de ${valorStr} referente a ${descricao}, na data ${paymentDate}.`;
  doc.text(declaracao, margin, y, { maxWidth: pageWidth - margin * 2, lineHeightFactor: 1.4 });

  y += 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(231, 76, 60);
  doc.text(valorStr, margin, y);

  const rows: [string, string][] = [
    ["Data do pagamento", paymentDate],
    ["Categoria", displayReceiptField(item.category)],
    ["Descrição / Destino", descricao],
    ["Valor pago", valorStr],
    ["Projeto / Loteamento", displayReceiptField(item.projectName)],
    ["Contrato", contrato],
    ["Cliente", displayReceiptField(item.customerName)],
    ["Corretor / Fornecedor / Beneficiário", beneficiario],
    ["Quadra / Lote", displayReceiptField(item.locationLabel)],
    ["Forma de pagamento", displayReceiptField(paymentMethod)],
    ["Código de validação", validationCode],
  ];

  autoTable(doc, {
    startY: y + 14,
    head: [["Campo", "Informação"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [52, 73, 94], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    margin: { left: margin, right: margin },
    columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: "auto" } },
  });

  let tableEnd =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? y + 100;

  let qrBase64: string | null = null;
  try {
    qrBase64 = await QRCode.toDataURL(validationUrl, { margin: 1, width: 256 });
    console.log("[RECIBO] validacao criada", validationUrl);
  } catch {
    qrBase64 = null;
  }

  if (tableEnd > pageHeight - 200) {
    doc.addPage();
    tableEnd = 40;
  }

  const qrY = tableEnd + 20;
  doc.setDrawColor(210);
  doc.line(margin, qrY, pageWidth - margin, qrY);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Escaneie o QR Code para validar a autenticidade deste recibo em /validar-recibo",
    margin,
    qrY + 12,
  );
  if (qrBase64) {
    doc.addImage(qrBase64, "PNG", pageWidth - margin - 76, qrY + 4, 68, 68);
  }

  let signY = qrY + 88;
  if (signY > pageHeight - 160) {
    doc.addPage();
    signY = 50;
  }

  const colMid = pageWidth / 2;
  const boxW = (pageWidth - margin * 2 - 16) / 2;

  const drawSignBox = (
    x: number,
    title: string,
    lines: string[],
    startY: number,
  ) => {
    doc.setDrawColor(200);
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(x, startY, boxW, 100, 3, 3, "FD");
    doc.setTextColor(50);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(title, x + 8, startY + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let ly = startY + 28;
    lines.forEach((line) => {
      doc.text(line, x + 8, ly);
      ly += 12;
    });
    doc.setDrawColor(160);
    doc.line(x + 8, startY + 78, x + boxW - 8, startY + 78);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("Assinatura", x + 8, startY + 90);
  };

  drawSignBox(margin, "Recebedor / Beneficiário", [
    "Nome: _________________________________",
    "CPF/CNPJ: _____________________________",
  ], signY);

  drawSignBox(margin + boxW + 16, "Empresa pagadora", [
    companyName,
    `CNPJ: ${companyCnpj}`,
  ], signY);

  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text(
    "Documento gerado digitalmente pelo SV LOTES — Recibo de pagamento (saída)",
    margin,
    pageHeight - 24,
  );

  return doc;
}
