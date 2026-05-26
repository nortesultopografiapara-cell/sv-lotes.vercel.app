import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
    createDocumentValidationCode,
    getValidationUrl,
} from '@/lib/pdfValidation';

export const addProfessionalFooterAndSignature = async (
    doc: jsPDF, 
    companyName: string, 
    documentType: string
) => {
    const pageCount = doc.internal.getNumberOfPages();
    const timestamp = new Date().toLocaleString('pt-BR');
    const hash = createDocumentValidationCode();
    const validationUrl = getValidationUrl(hash);

    let qrBase64 = null;
    try {
        qrBase64 = await QRCode.toDataURL(validationUrl, { margin: 1, width: 256 });
        console.log("[PDF] URL validação", validationUrl);
        console.log("PDF_QRCODE_GENERATED");
    } catch(err) {
        console.error("Erro QR Code", err);
    }

    // Add Signature Block on the last page
    doc.setPage(pageCount);
    
    // Check if there's space on last page. If not, add new page.
    // Usually jsPDF gives us y coordinate, but since we are modifying an existing doc, we'll try to guess or just append
    // For simplicity, we just add a small box at the bottom before the footer if space allows, or right above the footer margin.
    
    // Let's add a new page specifically for the signature to ensure it looks clean, OR put it at the bottom.
    // It's safer to put it on a new page if the previous page is full, but we'll just add a new page for the Digital Signature block.
    doc.addPage();
    const newPageCount = doc.internal.getNumberOfPages();
    doc.setPage(newPageCount);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(41, 128, 185);
    doc.text("DOCUMENTO GERADO DIGITALMENTE", 14, 40);
    
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text("SV LOTES — Gestão Imobiliária", 14, 50);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Responsável: ${companyName}`, 14, 60);
    doc.text(`Data/Hora: ${timestamp}`, 14, 65);
    doc.text(`Código de Validação: ${hash}`, 14, 70);
    doc.text("Escaneie para validar este relatório", 14, 76);
    
    if (qrBase64) {
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.addImage(qrBase64, 'PNG', pageWidth - 52, 38, 38, 38);
    }
    console.log("PDF_DIGITAL_SIGNATURE_CREATED");

    // Add Footer to ALL pages
    const finalPageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= finalPageCount; i++) {
        doc.setPage(i);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
        
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150);
        
        doc.text("SV LOTES — Gestão Imobiliária Inteligente", 14, pageHeight - 10);
        doc.text(companyName, 14, pageHeight - 6);
        
        doc.text(`Emitido em: ${timestamp}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        
        doc.text(`Página ${i} de ${finalPageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        console.log("PDF_PAGE_NUMBER_RENDERED");
    }
    
    console.log("PDF_FOOTER_RENDERED");
};
