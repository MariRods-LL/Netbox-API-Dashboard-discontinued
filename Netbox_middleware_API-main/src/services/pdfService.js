const PDFDocument =
    require("pdfkit");

function createReportPdf(res) {

    const doc =
        new PDFDocument();

    res.setHeader(
        "Content-Type",
        "application/pdf"
    );

    res.setHeader(
        "Content-Disposition",
        "inline; filename=report.pdf"
    );

    doc.pipe(res);

    doc.fontSize(20);

    doc.text(
        "Relatório Netbox"
    );

    doc.moveDown();

    doc.fontSize(12);

    doc.text(
        `Gerado em:
         ${new Date()
            .toLocaleString()}`
    );

    doc.end();

}

module.exports = {
    createReportPdf
};