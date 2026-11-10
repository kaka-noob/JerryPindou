export function imageFilename(date = new Date()) {
  const pad = (number: number) => String(number).padStart(2, '0');
  return `pd_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
}
