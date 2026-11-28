// Запустить после применения supabase/schema.sql и supabase/migration_dynamic_countries.sql: npm run seed
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { makeCountryNodes } from './src/focus-catalog.mjs';

const env = fs.readFileSync('.env','utf8').split(/\r?\n/).filter(x=>x.includes('=')).reduce((a,line)=>{const i=line.indexOf('=');a[line.slice(0,i)]=line.slice(i+1);return a;},{});
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Добавьте VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env');
const db = createClient(url,key);

const countries = [
  {code:'MI',name:'Королевство Монтескью-де-Искадрэ'},
  {code:'NF',name:'Северный Коммунистический Никонский Фронт'},
  {code:'CI',name:'Цитранская Империя Баклоред'}
];

const {error:countryError} = await db.from('countries').upsert(countries, { onConflict: 'code', ignoreDuplicates: true });
if (countryError) throw countryError;

const rows = countries.flatMap(country => makeCountryNodes(country.code));
for (let i=0; i<rows.length; i+=500) {
  const {error} = await db.from('focuses').upsert(rows.slice(i,i+500),{onConflict:'id'});
  if (error) throw error;
}
console.log(`Загружено ${rows.length} уникальных фокусов для ${countries.length} стран.`);
