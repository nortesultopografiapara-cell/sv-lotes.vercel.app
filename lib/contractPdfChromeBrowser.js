/**
 * Espelho browser-side de contractPdfPostProcess (html2pdf + chrome).
 * Mantido em sync com applyContractPdfChrome / removeTrailingBlankPdfPages.
 */
(function () {
  var CONTRACT_KEEP_MARKERS =
    /\b(cláusula|clausula|parágrafo|paragrafo|promitente|promissário|promissario|comprador|vendedor|testemunha|cpf|cnpj|assinatura|assinam|foro|multa|escritura|parcela|entrada|valor|instrumento|compromisso)\b/i;
  var PDF_CHROME_ONLY_MARKERS =
    /documento emitido digitalmente pelo sv lotes gis|página\s+\d+\s+de\s+\d+/i;

  function displayContractNumber(contractNumber) {
    if (!contractNumber) return 'S/N';
    var cleaned = String(contractNumber).replace(/^CTR-/gi, '').trim();
    if (/^\d{9}\/\d{4}$/.test(cleaned)) return cleaned;
    return 'S/N';
  }

  function extractPdfPageText(pdf, pageNum) {
    if (typeof pdf.getTextFromPage !== 'function') return '';
    try {
      var text = pdf.getTextFromPage(pageNum);
      var items = (text && text.items) || [];
      return items
        .map(function (it) {
          return String(it.str || '').trim();
        })
        .filter(Boolean)
        .join(' ');
    } catch (_e) {
      return '';
    }
  }

  function pdfPageHasContractualText(text) {
    var normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    return CONTRACT_KEEP_MARKERS.test(normalized);
  }

  function isContractPdfTrailingBlankPage(pdf, pageNum) {
    var text = extractPdfPageText(pdf, pageNum);
    var normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    if (pdfPageHasContractualText(normalized)) return false;

    var chromeOnly =
      PDF_CHROME_ONLY_MARKERS.test(normalized) &&
      normalized.length < 220 &&
      !CONTRACT_KEEP_MARKERS.test(normalized);

    var orphanCompanyFooter =
      normalized.length < 140 &&
      /\bcnpj\b/i.test(normalized) &&
      !CONTRACT_KEEP_MARKERS.test(normalized) &&
      !/cláusula|clausula|testemunha|promitente|promissário|promissario/i.test(normalized);

    return chromeOnly || orphanCompanyFooter;
  }

  function removeTrailingBlankPdfPages(pdf) {
    var total = pdf.internal.getNumberOfPages();
    if (total <= 1) return;
    if (!isContractPdfTrailingBlankPage(pdf, total)) return;
    pdf.deletePage(total);
  }

  function applyContractPdfChromeBrowser(pdf, data) {
    removeTrailingBlankPdfPages(pdf);

    var totalPages = pdf.internal.getNumberOfPages();
    var pageWidth = pdf.internal.pageSize.width;
    var pageHeight = pdf.internal.pageSize.height;
    var rightX = pageWidth - 14;
    var contractLabel = 'Contrato nº ' + displayContractNumber(data.contractNumber);

    for (var i = 1; i <= totalPages; i++) {
      pdf.setPage(i);

      var titleX = 14;
      if (data.logoBase64) {
        pdf.addImage(data.logoBase64, 'PNG', 14, 10, 22, 12, undefined, 'FAST');
        titleX = 39;
      }

      pdf.setFontSize(11);
      pdf.setTextColor(20);
      pdf.setFont('times', 'bold');
      var splitName = pdf.splitTextToSize(String(data.tenantName || '').toUpperCase(), 100);
      pdf.text(splitName, titleX, 13);

      pdf.setFontSize(9);
      pdf.setFont('times', 'normal');
      pdf.setTextColor(50);

      var yPos = 13 + splitName.length * 3.5;
      var infoParts = [];
      if (data.tenantCnpj) infoParts.push('CNPJ: ' + data.tenantCnpj);
      if (data.cityUfLine) infoParts.push(data.cityUfLine);
      if (infoParts.length > 0) {
        pdf.text(infoParts.join(' | '), titleX, yPos);
        yPos += 3.5;
      }

      if (data.addressLine) {
        var splitAddr = pdf.splitTextToSize(data.addressLine, 140);
        pdf.text(splitAddr, titleX, yPos);
        yPos += splitAddr.length * 3.5;
      }

      var finalY = Math.max(yPos, 22) + 2;

      pdf.setFontSize(8);
      pdf.setTextColor(100);
      pdf.text(contractLabel, rightX, 13, { align: 'right' });

      pdf.setDrawColor(150);
      pdf.setLineWidth(0.3);
      pdf.line(14, finalY, rightX, finalY);

      pdf.setLineWidth(0.2);
      pdf.line(14, pageHeight - 12, rightX, pageHeight - 12);

      pdf.setFontSize(7);
      pdf.setTextColor(150);
      pdf.setFont('times', 'italic');
      pdf.text('Documento emitido digitalmente pelo SV LOTES GIS', 14, pageHeight - 8);
      pdf.text('Página ' + i + ' de ' + totalPages, rightX, pageHeight - 8, { align: 'right' });
    }
  }

  window.applyContractPdfChromeBrowser = applyContractPdfChromeBrowser;
})();
