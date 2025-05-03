import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function TripForm() {
  const [date, setDate] = useState('')
  const [route, setRoute] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('trips').insert([{ date, route }])
    if (error) {
      setMessage('❌ Error: ' + error.message)
    } else {
      setMessage('✅ Trip logged!')
      setDate('')
      setRoute('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto mt-8">
      <div>
        <label className="block mb-1 font-semibold">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="border px-3 py-2 w-full rounded"
        />
      </div>
      <div>
        <label className="block mb-1 font-semibold">Route</label>
        <input
          type="text"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          placeholder="e.g. 501 Queen"
          required
          className="border px-3 py-2 w-full rounded"
        />
      </div>
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Submit
      </button>
      {message && <p className="text-sm mt-2">{message}</p>}
    </form>
  )
}
