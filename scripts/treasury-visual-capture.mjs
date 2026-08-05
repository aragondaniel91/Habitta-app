import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = 'http://127.0.0.1:4173/treasury-visual-review.html';
const output = process.env.VISUAL_OUTPUT ?? 'treasury-visual-review';
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });

const review = async (name, viewport, actions = async () => {}) => {
  const page = await browser.newPage({ viewportSize: viewport, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('Banco Mercantil USD').first().waitFor();
  await actions(page);
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  if (overflow.document > 1 || overflow.body > 1) {
    throw new Error(`${name} has horizontal overflow: ${JSON.stringify(overflow)}`);
  }
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await page.close();
};

await review('desktop-accounts', { width: 1440, height: 900 });
await review('desktop-movements', { width: 1440, height: 900 }, async (page) => {
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  await page.getByText('Pagos de cuotas aprobados').waitFor();
});
await review('desktop-reconciliations', { width: 1440, height: 900 }, async (page) => {
  await page.getByRole('tab', { name: 'Conciliaciones' }).click();
  await page.getByText('Estado bancario').first().waitFor();
});
await review('mobile-accounts', { width: 390, height: 844 });
await review('mobile-movement-form', { width: 390, height: 844 }, async (page) => {
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();
  await page.getByRole('heading', { name: 'Registrar movimiento' }).waitFor();
});

await browser.close();
console.log(`Treasury visual review captured in ${output}`);
