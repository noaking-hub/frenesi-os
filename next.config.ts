import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      /**
       * O padrão do Next é 1 MB, e uma foto de PIX tirada no celular passa
       * disso sozinha. Sem este teto o corpo da Server Action é cortado ANTES
       * de a action rodar: o operador não vê "O comprovante pode ter no máximo
       * 8 MB", vê o erro genérico de Server Action — e nenhuma das frases em
       * português que a action escreveu chega à tela.
       *
       * O limite é do módulo inteiro, então isso também conserta o comprovante
       * de reembolso das devoluções, que promete 8 MB na tela e até aqui
       * estava sujeito ao mesmo corte de 1 MB.
       *
       * `serverActions` ainda mora dentro de `experimental` no Next 16 — foi
       * conferido em node_modules/next/dist/server/config-shared.d.ts, onde
       * `bodySizeLimit` não existe no nível de cima.
       *
       * 12 MB e não 8: os dois números medem coisas diferentes. O teto de 8 MB
       * é do ARQUIVO, é regra de negócio e é o número dito ao operador. Este
       * aqui é do CORPO da requisição, que leva o arquivo MAIS os itens, o
       * cliente, a observação e as fronteiras multipart — com os dois iguais,
       * um comprovante de exatamente 8 MB (que a validação aceita de propósito)
       * seria cortado antes de a action rodar, que é o desfecho que este ajuste
       * existe para evitar.
       */
      bodySizeLimit: '12mb',
    },
  },
}

export default nextConfig
