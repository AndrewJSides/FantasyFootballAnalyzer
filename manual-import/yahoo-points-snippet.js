// -- TraderApe: pull Yahoo league-scored season points for all 150 drafted players --
// 1. Open your Yahoo league tab (football.fantasysports.yahoo.com), paste this into the console.
// 2. It fetches 6 batches and copies a {player_key: points} object to your clipboard.
// 3. Paste that into yahoo-points-merge.sql, run it in the Supabase SQL editor.

const KEYS = ["470.p.33393", "470.p.32711", "470.p.32687", "470.p.33500", "470.p.40118", "470.p.31883", "470.p.40059", "470.p.40055", "470.p.40168", "470.p.40196", "470.p.32692", "470.p.40041", "470.p.30972", "470.p.29279", "470.p.30977", "470.p.41791", "470.p.30121", "470.p.41807", "470.p.34019", "470.p.33996", "470.p.40875", "470.p.33394", "470.p.42625", "470.p.33398", "470.p.33477", "470.p.40899", "470.p.40039", "470.p.40908", "470.p.33423", "470.p.40084", "470.p.33413", "470.p.41793", "470.p.41821", "470.p.34010", "470.p.33963", "470.p.34120", "470.p.33967", "470.p.41804", "470.p.33965", "470.p.34007", "470.p.32705", "470.p.31905", "470.p.27581", "470.p.33966", "470.p.42654", "470.p.40878", "470.p.34008", "470.p.41922", "470.p.31908", "470.p.31002", "470.p.33989", "470.p.28534", "470.p.42626", "470.p.40993", "470.p.41799", "470.p.33991", "470.p.29269", "470.p.41824", "470.p.40881", "470.p.41795", "470.p.41877", "470.p.40102", "470.p.40896", "470.p.32671", "470.p.40234", "470.p.30994", "470.p.29369", "470.p.32703", "470.p.33392", "470.p.41900", "470.p.33514", "470.p.31856", "470.p.40926", "470.p.41823", "470.p.33100", "470.p.32723", "470.p.32725", "470.p.40893", "470.p.34447", "470.p.40901", "470.p.31896", "470.p.40900", "470.p.32704", "470.p.40883", "470.p.100007", "470.p.31960", "470.p.34107", "470.p.41810", "470.p.40819", "470.p.33508", "470.p.33538", "470.p.40962", "470.p.40064", "470.p.40121", "470.p.33998", "470.p.31010", "470.p.100026", "470.p.41808", "470.p.100034", "470.p.27535", "470.p.40126", "470.p.32231", "470.p.42655", "470.p.42010", "470.p.40971", "470.p.40051", "470.p.40877", "470.p.42744", "470.p.40063", "470.p.30197", "470.p.42669", "470.p.34088", "470.p.42642", "470.p.100014", "470.p.30123", "470.p.41845", "470.p.34659", "470.p.34095", "470.p.30295", "470.p.30259", "470.p.100017", "470.p.40042", "470.p.40119", "470.p.34085", "470.p.29792", "470.p.33389", "470.p.32676", "470.p.42638", "470.p.26686", "470.p.9265", "470.p.41312", "470.p.40835", "470.p.30346", "470.p.42025", "470.p.40048", "470.p.100016", "470.p.41048", "470.p.31482", "470.p.34218", "470.p.100021", "470.p.29235", "470.p.100008", "470.p.100024", "470.p.34344", "470.p.42730", "470.p.41062", "470.p.41499", "470.p.100023", "470.p.34104", "470.p.28378"];

const OUT = {};
function findPlayers(node) {
  if (Array.isArray(node)) { node.forEach(findPlayers); return; }
  if (node && typeof node === 'object') {
    if (node.player_key && node.player_points && node.player_points.total !== undefined) {
      const t = parseFloat(node.player_points.total);
      if (Number.isFinite(t)) OUT[node.player_key] = Math.round(t * 10) / 10;
      return;
    }
    Object.values(node).forEach(findPlayers);
  }
}
let failed = 0;
for (let i = 0; i < KEYS.length; i += 25) {
  const batch = KEYS.slice(i, i + 25);
  const url = 'https://pub-api-rw.fantasysports.yahoo.com/fantasy/v2/league/470.l.855311'
    + '/players;player_keys=' + batch.join(',') + ';out=stats?format=json';
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) { console.error('batch starting at', i, 'failed:', r.status); failed++; continue; }
  findPlayers(await r.json());
  await new Promise(res => setTimeout(res, 500));
}
console.log('Got ' + Object.keys(OUT).length + ' of ' + KEYS.length + ' players, failed batches: ' + failed);
copy(JSON.stringify(OUT));
console.log('Copied to clipboard -- paste it into yahoo-points-merge.sql');