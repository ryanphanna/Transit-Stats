// components/TripForm.js
'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://<YOUR-SUPABASE-PROJECT>.supabase.co';
const supabaseAnonKey = '<YOUR-ANON-KEY>';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function TripForm() {
  const [form, setForm] = useState({
    route: '',
    agency: '',
    mode: '',
    direction: '',
    stop: '',
    vehicle: '',
    notes: '',
    flags: '',
  });

  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const now = new Date();
    const localTime = now.toLocaleTimeString('en-CA', { hour12: false });
    const localMonth = now.toLocaleString('en-CA', { month: 'long' });
    const localYear = now.getFullYear();

    const { error } = await supabase.from('trips').insert({
      ...form,
      time: localTime,
      month: localMonth,
      year: localYear,
    });

    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage('✅ Trip logged!');
      setForm({
        route: '',
        agency: '',
        mode: '',
        direction: '',
        stop: '',
        vehicle: '',
        notes: '',
        flags: '',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1><strong>Transit.Stats</strong></h1>

      {[
        ['route', 'e.g. 501 Queen'],
        ['agency', 'e.g. TTC'],
        ['mode', 'e.g. Bus / Subway / Streetcar'],
        ['direction', 'e.g. Eastbound'],
        ['stop', 'e.g. Broadview Station'],
        ['vehicle', 'e.g. 4444'],
        ['notes', 'Optional notes'],
        ['flags', 'e.g. Late / Crowded']
      ].map(([name, placeholder]) => (
        <div key={name}>
          <label>{name.charAt(0).toUpperCase() + name.slice(1)}: </label>
          <input
            name={name}
            value={form[name]}
            onChange={handleChange}
            placeholder={placeholder}
          />
        </div>
      ))}

      <button type="submit">Submit</button>
      {message && <p>{message}</p>}
    </form>
  );
}
