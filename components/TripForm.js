import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function TripForm() {
  const [formData, setFormData] = useState({
    route: '',
    mode: '',
    agency: '',
    vehicle: '',
    direction: '',
    stop: '',
    notes: '',
    flags: ''
  });

  const [status, setStatus] = useState('')

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('trips').insert({
      created_at: new Date().toISOString(),
      ...formData
    });

    if (error) {
      setStatus(`❌ Error: ${error.message}`);
    } else {
      setStatus('✅ Trip added successfully!');
      setFormData({
        route: '',
        mode: '',
        agency: '',
        vehicle: '',
        direction: '',
        stop: '',
        notes: '',
        flags: ''
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto mt-8">
      {Object.keys(formData).map((field) => (
        <div key={field}>
          <label className="block mb-1 font-semibold">
            {field.charAt(0).toUpperCase() + field.slice(1)}
          </label>
          <input
            name={field}
            type="text"
            value={formData[field]}
            onChange={handleChange}
            className="border px-3 py-2 w-full rounded"
          />
        </div>
      ))}
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Submit
      </button>
      {status && <p className="text-sm mt-2">{status}</p>}
    </form>
  )
}
