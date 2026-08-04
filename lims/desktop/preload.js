/**
 * Renderer bilan asosiy jarayon o'rtasidagi tor ko'prik.
 *
 * Preload Electron 20+ da "sandbox" rejimida ishlaydi va unda node:os kabi
 * modullar mavjud emas. Shuning uchun kompyuter nomi asosiy jarayondan
 * additionalArguments orqali uzatiladi va bu yerda process.argv dan o'qiladi.
 */
const { contextBridge, ipcRenderer } = require('electron');

const stationArg = process.argv.find((a) => a.startsWith('--labcore-station='));
const station = stationArg ? stationArg.slice('--labcore-station='.length) : '';

contextBridge.exposeInMainWorld('labcore', {
  // Windows kompyuterining haqiqiy nomi — veb-interfeys shuni ishlatadi.
  station,
  isDesktop: true,
  testServer: (url) => ipcRenderer.invoke('labcore:test-server', url),
  saveServer: (url) => ipcRenderer.invoke('labcore:save-server', url),
});
