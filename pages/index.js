import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// 🔑 Replace these with your actual Supabase keys (go to Project Settings > API)
const supabaseUrl = 'https://fwbmqmaqefwhiwzkcjyv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3Ym1xbWFxZWZ3aGl3emtjanl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzMDE1OTEsImV4cCI6MjA2MTg3NzU5MX0.ujJI7jOrpw2Usiw56Z_Sdrjp7q8xu_o6bMXVeDAgP5Y';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Home() {
  const [route, setRoute] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { error } = await supabase.from('trips').insert({
      created_at: new Date().toISOString(),
      route: route,
    });

    if (error) {
      setStatus(`❌ Error: ${error.message}`);
    } else {
      setStatus('✅ Trip added successfully!');
      setRoute('');
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Transit.Stats</h1>

      <form onSubmit={handleSubmit}>
        <label>
          Route:
          <input
            type="text"
            placeholder="e.g. 501 Queen"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            required
            style={{ marginLeft: '0.5rem' }}
          />
        </label>
        <br /><br />
        <button type="submit">Submit</button>
      </form>

      {status && (
        <p style={{ marginTop: '1rem' }}>
          {status}
        </p>
      )}
    </div>
  );
}
