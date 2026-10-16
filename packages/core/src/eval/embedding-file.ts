/**
 * Formato compacto para gravar embeddings normalizados (valores em [-1, 1]) quantizados em int8.
 * 10.5k NCMs × 384 dims ≈ 4 MB: dá para versionar e rodar a regressão no CI sem baixar o modelo.
 *
 * Layout: cabeçalho JSON (uma linha, terminada em \n) + bytes int8 contíguos, na ordem de `codigos`.
 */
export interface ArquivoEmbeddings {
  modelo: string;
  dimensao: number;
  codigos: string[];
  vetores: number[][];
}

const ESCALA = 127;

export function serializarEmbeddings({ modelo, dimensao, codigos, vetores }: ArquivoEmbeddings): Uint8Array {
  if (codigos.length !== vetores.length) throw new Error("codigos e vetores com tamanhos diferentes");
  const cabecalho = new TextEncoder().encode(JSON.stringify({ modelo, dimensao, codigos, escala: ESCALA }) + "\n");
  const corpo = new Int8Array(codigos.length * dimensao);
  vetores.forEach((v, i) => {
    if (v.length !== dimensao) throw new Error(`Vetor ${codigos[i]} com dimensão ${v.length}, esperado ${dimensao}`);
    for (let j = 0; j < dimensao; j++) corpo[i * dimensao + j] = Math.max(-127, Math.min(127, Math.round(v[j]! * ESCALA)));
  });
  const saida = new Uint8Array(cabecalho.length + corpo.length);
  saida.set(cabecalho, 0);
  saida.set(new Uint8Array(corpo.buffer), cabecalho.length);
  return saida;
}

export function desserializarEmbeddings(bytes: Uint8Array): ArquivoEmbeddings {
  const fim = bytes.indexOf(10);
  if (fim < 0) throw new Error("Arquivo de embeddings sem cabeçalho");
  const { modelo, dimensao, codigos, escala } = JSON.parse(new TextDecoder().decode(bytes.subarray(0, fim))) as {
    modelo: string; dimensao: number; codigos: string[]; escala: number;
  };
  const corpo = new Int8Array(bytes.buffer, bytes.byteOffset + fim + 1, codigos.length * dimensao);
  const vetores = codigos.map((_, i) => Array.from(corpo.subarray(i * dimensao, (i + 1) * dimensao), (x) => x / escala));
  return { modelo, dimensao, codigos, vetores };
}
