/**
 * Contratos compartidos (solo tipos; la implementación vive en provider.js + providers/*).
 */
export interface ProductDescriptionStructured {
  title: string;
  description: string;
  benefits: string[];
  call_to_action: string;
  hashtags: string[];
}

export interface GenerateProductDescriptionInput {
  text?: string;
  productName?: string;
  maxDescriptionLength?: number;
  /** Por defecto `generateProductDescription`; define proveedor vía env AI_TASK_*_PROVIDER */
  taskId?: string;
}
