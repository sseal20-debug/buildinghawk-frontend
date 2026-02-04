const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://yzgpmobldrdpqscsomgm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6Z3Btb2JsZHJkcHFzY3NvbWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4OTU0MDcsImV4cCI6MjA1MjQ3MTQwN30.GMvSTJQ4mGEh_cdE8xJOO24b_rB1V5AEHr0MQPbZckg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCounts() {
  let output = '\n=== BuildingHawk Database Status ===\n';
  output += 'Checked at: ' + new Date().toLocaleString() + '\n\n';
  
  const { count: p } = await supabase.from('parcels').select('*', { count: 'exact', head: true });
  const { count: b } = await supabase.from('buildings').select('*', { count: 'exact', head: true });
  const { count: e } = await supabase.from('entities').select('*', { count: 'exact', head: true });
  
  output += 'Parcels:   ' + p + '\n';
  output += 'Buildings: ' + b + '\n';
  output += 'Entities:  ' + e + '\n';
  
  // Sample data
  const { data: samples } = await supabase.from('parcels').select('address, city').limit(5);
  output += '\nSample Parcels:\n';
  for (const s of (samples || [])) {
    output += '  - ' + s.address + ', ' + s.city + '\n';
  }
  
  fs.writeFileSync('C:\\Users\\User\\BuildingHawk\\db_status.txt', output);
  console.log(output);
  console.log('Status written to C:\\Users\\User\\BuildingHawk\\db_status.txt');
}

checkCounts().catch(err => {
  fs.writeFileSync('C:\\Users\\User\\BuildingHawk\\db_status.txt', 'Error: ' + err.message);
  console.error(err);
});
