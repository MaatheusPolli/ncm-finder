declare module "wink-bm25-text-search" {
  interface Bm25Engine {
    defineConfig(config: { fldWeights: Record<string, number>; bm25Params?: { k1?: number; b?: number; k?: number } }): boolean;
    definePrepTasks(tasks: ((texto: string) => string[])[]): number;
    addDoc(doc: Record<string, string>, id: string): number;
    consolidate(): boolean;
    search(texto: string, limite?: number): [string, number][];
  }
  export default function bm25(): Bm25Engine;
}
