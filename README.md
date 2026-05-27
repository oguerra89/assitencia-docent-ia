# Assistència Docent IA

Eina de suport per a mestres de primària · Catalunya · LOMLOE.

Genera documents pedagògics automatitzats utilitzant la IA d'Anthropic:
- **Reunions**: actes de cicle, claustre, famílies i professionals externs
- **Situacions d'Aprenentatge**: creador des de zero, arquitecte des de materials propis, adaptació DUA
- **Informes d'Avaluació**: comentaris d'avaluació multiàrea per alumne

## Tecnologies
- React 18
- Vite
- API d'Anthropic (Claude)
- lucide-react (icones)

## Instal·lació local
```bash
npm install
npm run dev
```

## Característiques
- Persistència automàtica al localStorage del navegador
- Anonimització automàtica de dades personals abans d'enviar-les a la IA
- Format LOMLOE oficial
- Exportació a PDF
