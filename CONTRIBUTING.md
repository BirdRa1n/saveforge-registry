# Contribuindo com o saveforge-registry

O caminho principal para contribuir com perfis de jogos vai ser o site da comunidade (SaveForge Community). Este repositório recebe os perfis aprovados lá e contém as ferramentas de publicação.

## Regras

- **Formato dos perfis:** todo perfil precisa ser válido pelo [profile v1](external/specs/profile/SPEC.md) e cumprir as regras de segurança de caminhos. As ferramentas daqui usam os schemas e a implementação de referência do submódulo `external/specs`, e nunca uma cópia local.
- **Atualizações do upstream:** uma atualização do manifest do Ludusavi vai num commit próprio, que muda só o `upstream/ludusavi.lock.json`. A descrição do commit deve trazer o diff do relatório de conversão (perfis novos, removidos e descartados).
- **Determinismo:** o build é determinístico. Datas e números de sequência vêm do commit fixado no upstream, e não do relógio. Mudanças no conversor precisam manter isso.
- **Chaves de produção:** nunca entram no repositório.

## Antes de abrir um PR

```bash
npm test
```

```bash
npm run build -- --keys test
```

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) em inglês, no imperativo, com até 72 caracteres no assunto. Exemplos de escopo: `feat(converter): …`, `build(upstream): …`.

Não adicione trailers de coautoria de ferramentas de IA.
