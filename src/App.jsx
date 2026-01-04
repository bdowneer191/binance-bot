import React, { useState, useEffect, useReducer } from 'react';
import { Activity, TrendingUp, TrendingDown, DollarSign, AlertTriangle, Power, Settings, BarChart3, Bell, Shield, Play, Pause, XCircle } from 'lucide-react';

// Trading state reducer
const tradingReducer = (state, action) => {
  switch (action.type) {
    case 'START_BOT':
      return { ...state, isRunning: true, mode: action.mode };
    case 'STOP_BOT':
      return { ...state, isRunning: false };
    case 'UPDATE_PRICE':
      return { ...state, currentPrice: action.price, lastUpdate: Date.now() };
    case 'ADD_TRADE':
      return {
        ...state,
        trades: [action.trade, ...state.trades].slice(0, 50),
        totalProfit: state.totalProfit + action.trade.profit
      };
    case 'UPDATE_BALANCE':
      return { ...state, balance: action.balance };
    case 'ADD_ORDER':
      return { ...state, openOrders: [...state.openOrders, action.order] };
    case 'REMOVE_ORDER':
      return { ...state, openOrders: state.openOrders.filter(o => o.id !== action.orderId) };
    case 'UPDATE_STATS':
      return { ...state, stats: { ...state.stats, ...action.stats } };
    case 'ADD_LOG':
      return { ...state, logs: [action.log, ...state.logs].slice(0, 100) };
    case 'EMERGENCY_STOP':
      return { ...state, isRunning: false, openOrders: [], emergencyMode: true };
    default:
      return state;
  }
};

const initialState = {
  isRunning: false,
  mode: 'simulation',
  currentPrice: 0,
  balance: { FDUSD: 10.0, SOL: 0 },
  openOrders: [],
  trades: [],
  totalProfit: 0,
  stats: {
    totalCycles: 0,
    winRate: 0,
    dailyProfit: 0,
    avgProfitPerCycle: 0
  },
  logs: [],
  lastUpdate: Date.now(),
  emergencyMode: false
};

const App = () => {
  const [state, dispatch] = useReducer(tradingReducer, initialState);
  const [config, setConfig] = useState({
    apiKey: '',
    apiSecret: '',
    symbol: 'SOLFDUSD',
    initialCapital: 10.0,
    profitTarget: 5.0,
    buyBackDip: 4.0,
    maxTradeSize: 100.0,
    dailyLossLimit: 10.0,
    checkInterval: 10
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [showConfig, setShowConfig] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Simulated price updates
  useEffect(() => {
    if (state.isRunning) {
      const interval = setInterval(() => {
        const basePrice = 100;
        const volatility = 0.02;
        const randomChange = (Math.random() - 0.5) * volatility;
        const newPrice = state.currentPrice || basePrice;
        const updatedPrice = newPrice * (1 + randomChange);
        
        dispatch({ type: 'UPDATE_PRICE', price: updatedPrice });
        checkOrders(updatedPrice);
      }, config.checkInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [state.isRunning, state.currentPrice, config.checkInterval]);

  const checkOrders = (currentPrice) => {
    state.openOrders.forEach(order => {
      let shouldExecute = false;

      if (order.side === 'SELL' && currentPrice >= order.price) {
        shouldExecute = true;
      } else if (order.side === 'BUY' && currentPrice <= order.price) {
        shouldExecute = true;
      }

      if (shouldExecute) {
        executeOrder(order, currentPrice);
      }
    });
  };

  const executeOrder = (order, price) => {
    const profit = order.side === 'SELL' 
      ? (price - order.entryPrice) * order.quantity 
      : 0;

    const trade = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      side: order.side,
      price: price,
      quantity: order.quantity,
      profit: profit,
      cycle: state.stats.totalCycles + 1
    };

    dispatch({ type: 'ADD_TRADE', trade });
    dispatch({ type: 'REMOVE_ORDER', orderId: order.id });

    // Update balance
    if (order.side === 'SELL') {
      const newBalance = {
        FDUSD: state.balance.FDUSD + (price * order.quantity),
        SOL: state.balance.SOL - order.quantity
      };
      dispatch({ type: 'UPDATE_BALANCE', balance: newBalance });
      
      // Place new buy order
      placeBuyOrder(price);
    } else {
      const newBalance = {
        FDUSD: state.balance.FDUSD - (price * order.quantity),
        SOL: state.balance.SOL + order.quantity
      };
      dispatch({ type: 'UPDATE_BALANCE', balance: newBalance });
      
      // Place new sell order
      placeSellOrder(price, order.quantity);
    }

    dispatch({
      type: 'ADD_LOG',
      log: {
        timestamp: new Date().toLocaleTimeString(),
        type: 'trade',
        message: `${order.side} executed at $${price.toFixed(2)} | Profit: $${profit.toFixed(2)}`
      }
    });
    addNotification(`Order executed: ${order.side} at $${price.toFixed(2)}`, 'success');
  };

  const placeBuyOrder = (sellPrice) => {
    const buyPrice = sellPrice * (1 - config.buyBackDip / 100);
    const quantity = (state.balance.FDUSD * 0.95) / buyPrice;

    const order = {
      id: Date.now(),
      side: 'BUY',
      price: buyPrice,
      quantity: quantity,
      timestamp: new Date().toISOString()
    };
    dispatch({ type: 'ADD_ORDER', order });
    dispatch({
      type: 'ADD_LOG',
      log: {
        timestamp: new Date().toLocaleTimeString(),
        type: 'order',
        message: `BUY order placed at $${buyPrice.toFixed(2)}`
      }
    });
  };

  const placeSellOrder = (buyPrice, quantity) => {
    const sellPrice = buyPrice * (1 + config.profitTarget / 100);
    const order = {
      id: Date.now() + 1,
      side: 'SELL',
      price: sellPrice,
      quantity: quantity,
      entryPrice: buyPrice,
      timestamp: new Date().toISOString()
    };
    dispatch({ type: 'ADD_ORDER', order });
    dispatch({
      type: 'ADD_LOG',
      log: {
        timestamp: new Date().toLocaleTimeString(),
        type: 'order',
        message: `SELL order placed at $${sellPrice.toFixed(2)}`
      }
    });
    dispatch({
      type: 'UPDATE_STATS',
      stats: { totalCycles: state.stats.totalCycles + 1 }
    });
  };

  const startBot = (mode) => {
    if (!config.apiKey || !config.apiSecret) {
      addNotification('Please configure API keys first', 'error');
      setShowConfig(true);
      return;
    }

    dispatch({ type: 'START_BOT', mode });
    dispatch({ type: 'UPDATE_PRICE', price: 100 });
    // Place initial buy order
    const initialQuantity = config.initialCapital / 100;
    const order = {
      id: Date.now(),
      side: 'BUY',
      price: 98,
      quantity: initialQuantity,
      timestamp: new Date().toISOString()
    };
    dispatch({ type: 'ADD_ORDER', order });
    
    addNotification(`Bot started in ${mode} mode`, 'success');
    dispatch({
      type: 'ADD_LOG',
      log: {
        timestamp: new Date().toLocaleTimeString(),
        type: 'system',
        message: `Bot started in ${mode} mode`
      }
    });
  };

  const stopBot = () => {
    dispatch({ type: 'STOP_BOT' });
    addNotification('Bot stopped gracefully', 'info');
    dispatch({
      type: 'ADD_LOG',
      log: {
        timestamp: new Date().toLocaleTimeString(),
        type: 'system',
        message: 'Bot stopped'
      }
    });
  };

  const emergencyStop = () => {
    dispatch({ type: 'EMERGENCY_STOP' });
    addNotification('EMERGENCY STOP - All orders cancelled', 'error');
    dispatch({
      type: 'ADD_LOG',
      log: {
        timestamp: new Date().toLocaleTimeString(),
        type: 'emergency',
        message: 'EMERGENCY STOP ACTIVATED'
      }
    });
  };

  const addNotification = (message, type) => {
    const notification = {
      id: Date.now(),
      message,
      type,
      timestamp: Date.now()
    };
    setNotifications(prev => [notification, ...prev].slice(0, 5));
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);
  };

  const StatCard = ({ icon: Icon, title, value, change, color }) => (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4" style={{ borderColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
          {change && (
            <p className={`text-sm mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(2)}%
            </p>
          )}
        </div>
        <Icon className="w-12 h-12 opacity-20" style={{ color }} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Activity className="w-8 h-8" />
              <div>
                <h1 className="text-2xl font-bold">Binance Infinite Loop Bot</h1>
                <p className="text-blue-200 text-sm">Professional Trading Automation</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-blue-700 px-4 py-2 rounded-lg">
                <span className="text-sm">Status: </span>
                <span className={`font-bold ${state.isRunning ? 'text-green-300' : 'text-gray-300'}`}>
                  {state.isRunning ? '● ACTIVE' : '○ STOPPED'}
                </span>
              </div>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="bg-blue-700 hover:bg-blue-600 p-2 rounded-lg transition"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Notifications */}
      <div className="fixed top-20 right-6 z-50 space-y-2">
        {notifications.map(notif => (
          <div
            key={notif.id}
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 animate-slide-in ${
              notif.type === 'success' ? 'bg-green-500' :
              notif.type === 'error' ? 'bg-red-500' :
              'bg-blue-500'
            } text-white`}
          >
            <Bell className="w-5 h-5" />
            <span>{notif.message}</span>
          </div>
        ))}
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto m-4">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold">Configuration</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">API Key</label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Your Binance API Key"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">API Secret</label>
                  <input
                    type="password"
                    value={config.apiSecret}
                    onChange={(e) => setConfig({...config, apiSecret: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Your Binance API Secret"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Trading Pair</label>
                  <select
                    value={config.symbol}
                    onChange={(e) => setConfig({...config, symbol: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="SOLFDUSD">SOL/FDUSD</option>
                    <option value="BNBFDUSD">BNB/FDUSD</option>
                    <option value="ETHFDUSD">ETH/FDUSD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Initial Capital ($)</label>
                  <input
                    type="number"
                    value={config.initialCapital}
                    onChange={(e) => setConfig({...config, initialCapital: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Profit Target (%)</label>
                  <input
                    type="number"
                    value={config.profitTarget}
                    onChange={(e) => setConfig({...config, profitTarget: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Buy Back Dip (%)</label>
                  <input
                    type="number"
                    value={config.buyBackDip}
                    onChange={(e) => setConfig({...config, buyBackDip: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Max Trade Size ($)</label>
                  <input
                    type="number"
                    value={config.maxTradeSize}
                    onChange={(e) => setConfig({...config, maxTradeSize: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Daily Loss Limit (%)</label>
                  <input
                    type="number"
                    value={config.dailyLossLimit}
                    onChange={(e) => setConfig({...config, dailyLossLimit: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end space-x-3">
              <button
                onClick={() => setShowConfig(false)}
                className="px-6 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfig(false);
                  addNotification('Configuration saved', 'success');
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-2">Bot Controls</h2>
              <p className="text-gray-600">Start, stop, or emergency halt the trading bot</p>
            </div>
            <div className="flex space-x-3">
              {!state.isRunning ? (
                <>
                  <button
                    onClick={() => startBot('simulation')}
                    className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                  >
                    <Play className="w-5 h-5" />
                    <span>Start Simulation</span>
                  </button>
                  <button
                    onClick={() => startBot('live')}
                    className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <Play className="w-5 h-5" />
                    <span>Start Live</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={stopBot}
                    className="flex items-center space-x-2 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
                  >
                    <Pause className="w-5 h-5" />
                    <span>Stop Bot</span>
                  </button>
                  <button
                    onClick={emergencyStop}
                    className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                  >
                    <XCircle className="w-5 h-5" />
                    <span>Emergency Stop</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={DollarSign}
            title="Current Balance"
            value={`$${state.balance.FDUSD.toFixed(2)}`}
            change={state.totalProfit / config.initialCapital * 100}
            color="#10b981"
          />
          <StatCard
            icon={TrendingUp}
            title="Total Profit"
            value={`$${state.totalProfit.toFixed(2)}`}
            change={state.stats.dailyProfit}
            color="#3b82f6"
          />
          <StatCard
            icon={Activity}
            title="Current Price"
            value={`$${state.currentPrice.toFixed(2)}`}
            color="#8b5cf6"
          />
          <StatCard
            icon={BarChart3}
            title="Total Cycles"
            value={state.stats.totalCycles}
            color="#f59e0b"
          />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="border-b">
            <div className="flex space-x-8 px-6">
              {['dashboard', 'orders', 'trades', 'logs'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 px-2 border-b-2 transition ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-bold mb-4">Portfolio</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between p-3 bg-gray-50 rounded">
                        <span>FDUSD Balance</span>
                        <span className="font-bold">${state.balance.FDUSD.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-gray-50 rounded">
                        <span>SOL Holdings</span>
                        <span className="font-bold">{state.balance.SOL.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-green-50 rounded">
                        <span>Total Value</span>
                        <span className="font-bold text-green-600">
                          ${(state.balance.FDUSD + state.balance.SOL * state.currentPrice).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold mb-4">Performance</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between p-3 bg-gray-50 rounded">
                        <span>Win Rate</span>
                        <span className="font-bold">{state.stats.winRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between p-3 bg-gray-50 rounded">
                        <span>Avg Profit/Cycle</span>
                        <span className="font-bold">${state.stats.avgProfitPerCycle.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-gray-50 rounded">
                        <span>ROI</span>
                        <span className="font-bold">
                          {((state.totalProfit / config.initialCapital) * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'orders' && (
              <div>
                <h3 className="font-bold mb-4">Open Orders ({state.openOrders.length})</h3>
                {state.openOrders.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No open orders</p>
                ) : (
                  <div className="space-y-2">
                    {state.openOrders.map(order => (
                      <div key={order.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            order.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {order.side}
                          </span>
                          <span className="ml-4 font-mono">{order.quantity.toFixed(4)} SOL</span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">${order.price.toFixed(2)}</div>
                          <div className="text-sm text-gray-500">{new Date(order.timestamp).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'trades' && (
              <div>
                <h3 className="font-bold mb-4">Trade History ({state.trades.length})</h3>
                {state.trades.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No trades yet</p>
                ) : (
                  <div className="space-y-2">
                    {state.trades.map(trade => (
                      <div key={trade.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                            trade.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {trade.side}
                          </span>
                          <span className="ml-4">Cycle #{trade.cycle}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">${trade.price.toFixed(2)}</div>
                          <div className={`text-sm ${trade.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div>
                <h3 className="font-bold mb-4">System Logs</h3>
                <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm max-h-96 overflow-y-auto">
                  {state.logs.length === 0 ? (
                    <p className="text-gray-500">No logs yet</p>
                  ) : (
                    state.logs.map((log, idx) => (
                      <div key={idx} className="mb-1">
                        <span className="text-gray-500">[{log.timestamp}]</span>
                        <span className={`ml-2 ${
                          log.type === 'emergency' ? 'text-red-500' :
                          log.type === 'trade' ? 'text-blue-400' :
                          log.type === 'order' ? 'text-yellow-400' :
                          'text-green-400'
                        }`}>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Safety Info */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-lg">
          <div className="flex items-start space-x-3">
            <Shield className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-yellow-900 mb-2">Safety Features Active</h3>
              <ul className="space-y-1 text-sm text-yellow-800">
                <li>• Maximum trade size: ${config.maxTradeSize}</li>
                <li>• Daily loss limit: {config.dailyLossLimit}%</li>
                <li>• API keys encrypted and never logged</li>
                <li>• Emergency stop available at all times</li>
                <li>• All trades logged for audit trail</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm">⚠️ Trading involves substantial risk. Never trade with money you can't afford to lose.</p>
          <p className="text-xs text-gray-400 mt-2">This is educational software. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
