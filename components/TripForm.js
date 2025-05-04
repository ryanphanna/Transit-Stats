import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fwbmqmaqefwhiwzkcjyv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3Ym1xbWFxZWZ3aGl3emtjanl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzMDE1OTEsImV4cCI6MjA2MTg3NzU5MX0.ujJI7jOrpw2Usiw56Z_Sdrjp7q8xu_o6bMXVeDAgP5Y';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function TripForm() {
  const [formData, setFormData] = useState({
    route: '',
    agency: '',
    mode: '',
    direction: '',
    stop: '',
    vehicle: '',
    notes: '',
    flags: ''
  });
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const now = new Date();
    const utcTime = now.toISOString().split('T')[1].split('.')[0]; // 'HH:MM:SS'
    const localMonth = now.toLocaleString('default', { month: 'short' });
    const year = now.getFullYear();

    const { error } = await supabase.from('trips').insert([{
      ...formData,
      time: utcTime,
      month: localMonth,
      year
    }]);

    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage('✅ Trip logged!');
      setFormData({
        route: '',
        agency: '',
        mode: '',
        direction: '',
        stop: '',
        vehicle: '',
        notes: '',
        flags: ''
      });
    }
  };

  return (
    <div>
      <h1>Transit.Stats</h1>
      <form onSubmit={handleSubmit}>
        {Object.keys(formData).map((field) => (
          <div key={field}>
            <label>
              {field.charAt(0).toUpperCase() + field.slice(1)}:{' '}
              <input
                type="text"
                name={field}
                value={formData[field]}
                onChange={handleChange}
                placeholder={`e.g. ${field === 'route' ? '501 Queen' : ''}`}
              />
            </label>
          </div>
        ))}
        <button type="submit">Submit</button>
      </form>
      <p>{message}</p>
    </div>
  );
}
