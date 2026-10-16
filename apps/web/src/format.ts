/** Cópia local de formatarCodigo: o core importa módulos Node, então o front só usa seus tipos. */
export function formatarCodigoWeb(codigo: string): string {
  return /^\d{8}$/.test(codigo) ? `${codigo.slice(0, 4)}.${codigo.slice(4, 6)}.${codigo.slice(6)}` : codigo;
}
