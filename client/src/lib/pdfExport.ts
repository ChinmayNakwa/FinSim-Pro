import jsPDF from "jspdf";
import { marked } from "marked";

interface PDFConfig {
  margin: number;
  lineHeight: {
    normal: number;
    heading: number;
    subheading: number;
    bullet: number;
    paragraph: number;
  };
  fontSize: {
    title: number;
    heading: number;
    subheading: number;
    body: number;
    footer: number;
  };
  colors: {
    primary: [number, number, number];
    text: [number, number, number];
    accent: [number, number, number];
  };
}

const config: PDFConfig = {
  margin: 20,
  lineHeight: {
    normal: 6,
    heading: 10,
    subheading: 7,
    bullet: 6,
    paragraph: 7,
  },
  fontSize: {
    title: 20,
    heading: 14,
    subheading: 12,
    body: 10,
    footer: 8,
  },
  colors: {
    primary: [41, 98, 255], // Blue
    text: [33, 33, 33],
    accent: [100, 100, 100],
  },
};

export const generatePDF = async (markdown: string, title: string) => {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - config.margin * 2;

  let y = config.margin;
  let pageNumber = 1;

  // Add page numbers
  const addPageNumber = () => {
    pdf.setFontSize(config.fontSize.footer);
    pdf.setTextColor(...config.colors.accent);
    pdf.text(
      `Page ${pageNumber}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
    pageNumber++;
  };

  // Check if new page is needed
  const checkPageBreak = (spaceNeeded: number = 15) => {
    if (y > pageHeight - spaceNeeded - config.margin) {
      addPageNumber();
      pdf.addPage();
      y = config.margin;
      return true;
    }
    return false;
  };

  // Parse markdown to HTML
  const html = await marked.parse(markdown);

  // Clean and normalize text
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/₹/g, "Rs.")
    .trim();

  // Split into paragraphs and process
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  // --- TITLE SECTION ---
  pdf.setFillColor(...config.colors.primary);
  pdf.rect(0, 0, pageWidth, 45, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(config.fontSize.title);
  pdf.setTextColor(255, 255, 255);
  
  const titleLines = pdf.splitTextToSize(title, maxWidth - 20);
  let titleY = 25;
  titleLines.forEach((line: string) => {
    pdf.text(line, pageWidth / 2, titleY, { align: "center" });
    titleY += 7;
  });

  y = 55;

  // Add generation date
  pdf.setFontSize(config.fontSize.footer);
  pdf.setTextColor(...config.colors.accent);
  const date = new Date().toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  pdf.text(`Generated on ${date}`, config.margin, y);
  y += 12;

  // --- CONTENT RENDERING ---
  pdf.setTextColor(...config.colors.text);

  paragraphs.forEach((paragraph) => {
    const lines = paragraph.split("\n").filter((l) => l.trim());

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      checkPageBreak();

      // Main headings (1., 2., 3., 4.)
      if (trimmed.match(/^\d+\.\s+[A-Z]/)) {
        if (y > 55) y += 5; // Add space before heading (except first)
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(config.fontSize.heading);
        pdf.setTextColor(...config.colors.primary);
        
        const headingLines = pdf.splitTextToSize(trimmed, maxWidth);
        headingLines.forEach((hl: string) => {
          pdf.text(hl, config.margin, y);
          y += config.lineHeight.heading;
        });
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(config.fontSize.body);
        pdf.setTextColor(...config.colors.text);
        return;
      }

      // Sub-headings (A., B., C.)
      if (trimmed.match(/^[A-Z]\.\s+/)) {
        y += 3;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(config.fontSize.subheading);
        
        const subLines = pdf.splitTextToSize(trimmed, maxWidth);
        subLines.forEach((sl: string) => {
          pdf.text(sl, config.margin, y);
          y += config.lineHeight.subheading;
        });
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(config.fontSize.body);
        return;
      }

      // Bullet points
      if (trimmed.match(/^[-•*]\s+/)) {
        const bulletText = trimmed.replace(/^[-•*]\s*/, "");
        const bulletLines = pdf.splitTextToSize(bulletText, maxWidth - 8);
        
        bulletLines.forEach((bl: string, i: number) => {
          checkPageBreak();
          if (i === 0) {
            pdf.text("•", config.margin + 2, y);
            pdf.text(bl, config.margin + 8, y);
          } else {
            pdf.text(bl, config.margin + 8, y);
          }
          y += config.lineHeight.bullet;
        });
        return;
      }

      // Normal paragraph text
      const normalLines = pdf.splitTextToSize(trimmed, maxWidth);
      normalLines.forEach((nl: string) => {
        checkPageBreak();
        pdf.text(nl, config.margin, y);
        y += config.lineHeight.normal;
      });

      // Add spacing after paragraphs
      if (index === lines.length - 1) {
        y += 2;
      }
    });
  });

  // --- FOOTER ---
  addPageNumber();
  
  pdf.setFontSize(config.fontSize.footer);
  pdf.setTextColor(...config.colors.accent);
  pdf.text(
    "Generated by FinSim Pro",
    config.margin,
    pageHeight - 10
  );

  // Save
  const fileName = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  pdf.save(`${fileName}.pdf`);
};