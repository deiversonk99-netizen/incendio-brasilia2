export const PDF_ASSETS_BUCKET = 'pdf-assets';

const GLOBAL_CRQ_CERTIFICATE_DIRECTORY = 'company/certificates';

export const createGlobalCrqCertificatePath = (): string => {
    return `${GLOBAL_CRQ_CERTIFICATE_DIRECTORY}/crq-pj-crea-${Date.now()}.pdf`;
};

export const MAX_PDF_ASSET_SIZE_BYTES = 10 * 1024 * 1024;

export const isPdfFile = (file: File): boolean => {
    const hasPdfMimeType = file.type === 'application/pdf';
    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    return hasPdfMimeType || hasPdfExtension;
};
