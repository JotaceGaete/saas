import { writeFileSync } from 'fs'
import { welcomeEmail } from '../src/emails/templates/welcome.js'

const cases = [
  {
    label: 'con-nombre-y-negocio',
    payload: { name: 'Juan', business_name: 'Artes SPA', user_email: 'juan@artes.cl' },
  },
  {
    label: 'sin-nombre',
    payload: { business_name: 'Artes SPA', user_email: 'juan@artes.cl' },
  },
  {
    label: 'sin-negocio',
    payload: { name: 'Juan', user_email: 'juan@artes.cl' },
  },
]

for (const { label, payload } of cases) {
  const { subject, html, text } = welcomeEmail(payload)
  const file = `scripts/preview-welcome-${label}.html`
  writeFileSync(file, html)
  console.log(`[${label}]`)
  console.log(`  subject : ${subject}`)
  console.log(`  text[0] : ${text.split('\n')[0]}`)
  console.log(`  html    : ${file}`)
  console.log()
}
