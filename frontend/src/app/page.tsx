'use client'

import { useState } from 'react'

const environments = [
  { name: 'LunarLander-v2', id: 'ID:01', details: 'Discrete / Box(8)' },
  { name: 'CartPole-v1', id: 'ID:02', details: 'Discrete / Box(4)' },
  { name: 'BipedalWalker-v3', id: 'ID:03', details: 'Continuous / Box(24)' }
]

const logs = [
  { time: '11:04', message: 'Model checkpoint saved (ep_400)', isWarning: false },
  { time: '11:03', message: 'Evaluation started: 10 episodes', isWarning: false },
  { time: '11:02', message: 'Warning: High variance detected', isWarning: true },
  { time: '11:00', message: 'Training started [PPO]', isWarning: false },
  { time: '10:59', message: 'Environment initialized', isWarning: false }
]

const barHeights = [20, 35, 40, 30, 55, 65, 45, 70, 80, 75, 90, 60, 50, 40, 55, 85, 95, 80, 70, 60, 65, 55, 45, 35]

export default function Home() {
  const [activeEnv, setActiveEnv] = useState(0)
  const [algorithm, setAlgorithm] = useState('PPO (Proximal Policy)')
  const [learningRate, setLearningRate] = useState('0.0003')
  const [timesteps, setTimesteps] = useState('1,000,000')
  const [isRecording, setIsRecording] = useState(false)
  const [metrics] = useState({
    meanReward: 204.2,
    epsLength: 302,
    loss: 0.021,
    fps: 144
  })

  return (
    <>
      {/* Header */}
      <header style={{
        height: '60px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-md)',
        flexShrink: 0
      }}>
        <div style={{
          fontSize: '20px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-sm)'
        }}>
          <span className="text-outline">RL LAB</span>
          <span style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            fontWeight: 400
          }}>// GYM MANAGER</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span className="label" style={{ margin: 0 }}>v2.4.0</span>
          <div style={{ width: '8px', height: '8px', background: '#00FF00', borderRadius: '50%' }} />
        </div>
      </header>

      {/* Main Grid */}
      <main className="main-grid" style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '280px 1fr 320px',
        height: 'calc(100vh - 60px)',
        overflow: 'hidden'
      }}>
        {/* Left Column - Environment & Config */}
        <div className="col" style={{
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}>
          {/* Environment Select Header */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-color)',
            zIndex: 10
          }}>
            <span className="label" style={{ margin: 0 }}>ENVIRONMENT SELECT</span>
          </div>

          {/* Environment Cards */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)'
          }}>
            {environments.map((env, index) => (
              <div
                key={index}
                className={`env-card ${activeEnv === index ? 'active' : ''}`}
                onClick={() => setActiveEnv(index)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600 }}>{env.name}</span>
                  <span style={{ fontSize: '10px' }}>{env.id}</span>
                </div>
                <span className="label" style={{ margin: 0 }}>{env.details}</span>
              </div>
            ))}
          </div>

          {/* Hyperparameters Header */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-color)',
            zIndex: 10,
            borderTop: '1px solid var(--border-color)'
          }}>
            <span className="label" style={{ margin: 0 }}>HYPERPARAMETERS</span>
          </div>

          {/* Hyperparameters Form */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label className="label">Algorithm</label>
              <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)}>
                <option>PPO (Proximal Policy)</option>
                <option>DQN (Deep Q-Network)</option>
              </select>
            </div>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label className="label">Learning Rate</label>
              <input 
                type="number" 
                value={learningRate} 
                step="0.0001"
                onChange={(e) => setLearningRate(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label className="label">Total Timesteps</label>
              <input 
                type="text" 
                value={timesteps}
                onChange={(e) => setTimesteps(e.target.value)}
              />
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: 'var(--space-sm)', 
              marginTop: 'var(--space-lg)' 
            }}>
              <button className="btn btn-primary">Train</button>
              <button className="btn btn-secondary">Test</button>
            </div>
          </div>
        </div>

        {/* Center Column - Live Feed */}
        <div className="col" style={{
          background: 'var(--surface-color)',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}>
          {/* Live Feed Header */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-color)',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label" style={{ margin: 0 }}>LIVE FEED</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: 'auto', padding: '4px 12px', fontSize: '10px' }}
                  onClick={() => setIsRecording(!isRecording)}
                >
                  {isRecording ? 'Stop' : 'Record'}
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: 'auto', padding: '4px 12px', fontSize: '10px' }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Stage / Visualization */}
          <div className="stage" style={{
            background: '#0D0D0D',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            color: 'white',
            minHeight: '300px'
          }}>
            {/* Lunar Lander Visual */}
            <div style={{ position: 'relative', width: '200px', height: '150px' }}>
              <div style={{ 
                position: 'absolute', 
                bottom: '20px', 
                left: 0, 
                right: 0, 
                height: '2px', 
                background: 'white', 
                borderRadius: '1px' 
              }} />
              <div style={{ 
                position: 'absolute', 
                bottom: '80px', 
                left: '90px', 
                width: '20px', 
                height: '20px', 
                border: '1px solid white', 
                transform: 'rotate(15deg)' 
              }} />
              <div style={{ 
                position: 'absolute', 
                bottom: '65px', 
                left: '98px', 
                width: '4px', 
                height: '12px', 
                background: 'white', 
                transform: 'rotate(15deg)' 
              }} />
              <div style={{ 
                position: 'absolute', 
                bottom: '50px', 
                left: '96px', 
                width: '2px', 
                height: '2px', 
                background: 'rgba(255,255,255,0.6)' 
              }} />
              <div style={{ 
                position: 'absolute', 
                bottom: '45px', 
                left: '100px', 
                width: '2px', 
                height: '2px', 
                background: 'rgba(255,255,255,0.4)' 
              }} />
            </div>
            
            {/* Episode/Reward Badges */}
            <div style={{
              position: 'absolute',
              top: 'var(--space-md)',
              left: 'var(--space-md)',
              pointerEvents: 'none'
            }}>
              <span style={{
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(4px)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '10px',
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'inline-block',
                marginRight: '8px'
              }}>EPISODE: 412</span>
              <span style={{
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(4px)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '10px',
                border: '1px solid rgba(255,255,255,0.2)',
                display: 'inline-block'
              }}>REWARD: +24.5</span>
            </div>
          </div>

          {/* Metrics Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-color)'
          }}>
            <div style={{ padding: 'var(--space-md)', borderRight: '1px solid var(--border-color)' }}>
              <span className="label">Mean Reward</span>
              <div style={{ fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em' }}>
                {metrics.meanReward}
              </div>
            </div>
            <div style={{ padding: 'var(--space-md)', borderRight: '1px solid var(--border-color)' }}>
              <span className="label">Eps Length</span>
              <div style={{ fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em' }}>
                {metrics.epsLength}
              </div>
            </div>
            <div style={{ padding: 'var(--space-md)', borderRight: '1px solid var(--border-color)' }}>
              <span className="label">Loss</span>
              <div style={{ fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em' }}>
                {metrics.loss}
              </div>
            </div>
            <div style={{ padding: 'var(--space-md)' }}>
              <span className="label">FPS</span>
              <div style={{ fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em' }}>
                {metrics.fps}
              </div>
            </div>
          </div>

          {/* Reward History */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-color)',
            flex: 1
          }}>
            <span className="label">REWARD HISTORY (LAST 100)</span>
            <div style={{
              height: '60px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '2px',
              marginTop: 'var(--space-sm)'
            }}>
              {barHeights.map((height, index) => (
                <div key={index} className="bar" style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Analysis & Events */}
        <div className="col col-right" style={{
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}>
          {/* Analysis Header */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-color)',
            zIndex: 10
          }}>
            <span className="label" style={{ margin: 0 }}>ANALYSIS & EXPLAINER</span>
          </div>
          
          {/* Analysis Content */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <div className="label" style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>
              POLICY BEHAVIOR DETECTED
            </div>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-md)',
              lineHeight: 1.6
            }}>
              The agent has converged on a stable hovering strategy. Initial variance in the X-axis has reduced by 40% over the last 50 episodes.
            </p>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-md)',
              lineHeight: 1.6
            }}>
              Reward shaping suggests the penalty for thruster usage is currently outweighing the benefit of rapid descent. Consider adjusting <code style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                background: 'var(--surface-color)',
                padding: '2px 4px',
                borderRadius: '2px'
              }}>main_engine_penalty</code>.
            </p>
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: '10px', width: 'auto' }}
            >
              Generate Report
            </button>
          </div>

          {/* Event Log Header */}
          <div style={{
            padding: 'var(--space-md)',
            borderBottom: '1px solid var(--border-color)',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-color)',
            zIndex: 10,
            borderTop: '1px solid var(--border-color)'
          }}>
            <span className="label" style={{ margin: 0 }}>EVENT LOG</span>
          </div>
          
          {/* Event Log Entries */}
          <div style={{ padding: '0 var(--space-md)' }}>
            {logs.map((log, index) => (
              <div key={index} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                padding: '8px 0',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                gap: 'var(--space-sm)'
              }}>
                <span style={{ 
                  color: 'var(--text-secondary)', 
                  width: '50px', 
                  flexShrink: 0 
                }}>{log.time}</span>
                <span style={{ color: log.isWarning ? 'red' : 'inherit' }}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
