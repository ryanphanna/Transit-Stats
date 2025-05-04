import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function TripForm() {
  const [formData, setFormData] = useState({
    route: '',
    agency: '',
    mode: '',
    direction: '',
    stop: '',
    vehicle: '',
    notes: '',
    flags: '',
    time: '',
    month: '',
    year: ''
  });

  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const now = new Date();
    const time = now.toTimeString().split(' ')[0]; // HH:MM:SS
    const month = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();

    const { error } = await supabase.from('trips').insert([
      {
        route: formData.route,
        agency: formData.agency,
        mode: formData.mode,
        direction: formData.direction,
        stop: formData.stop,
        vehicle: formData.vehicle,
        notes: formData.notes,
        flags: formData.flags,
        time,
        month,
        year
      }
    ]);

    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage('✅ Trip added successfully!');
      setFormData({
        route: '',
        agency: '',
        mode: '',
        direction: '',
        stop: '',
        vehicle: '',
        notes: '',
        flags: '',
        time: '',
        month: '',
        year: ''
      });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>Transit.Stats</h1>
      {['route', 'agency', 'mode', 'direction', 'stop', 'vehicle', 'notes', 'flags'].map((field) => (
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
      <p>{message}</p>
    </form>
  );
}
