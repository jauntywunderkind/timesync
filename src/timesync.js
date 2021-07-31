/**
 * timesync
 *
 * Time synchronization between peers
 *
 * https://github.com/enmasseio/timesync
 */

import * as util from './util.js'
import * as stat from './stat.js'

/**
 * Factory function to create a timesync instance
 * @param {Object} [options]	TODO: describe options
 * @return {Object} Returns a new timesync instance
 */
export class TimeSync extends EventTarget {

	/** @type {number} The current offset from system time */
	offset: 0 // ms

	/** @type {number} Contains the timeout for the next synchronization */
	_interval: null

	/** @type {Object.<string, function>} Contains a map with requests in progress */
	_inProgress: {}

	/**
	 * @type {boolean}
	 * This property used to immediately apply the first ever received offset.
	 * After that, it's set to false and not used anymore.
	 */
	_isFirst: true

	/**
	 * Send a message to a peer
	 * This method must be overridden when using timesync
	 * @param {string} to
	 * @param {*} data
	 */
	send: async function (to, data, timeout) {
		try {
			const res = await request.post(to, data, timeout)
			this.receive(to, res[0])
		} catch(err) {
			emitError(err)
		}
	}

	/**
	 * Receive method to be called when a reply comes in
	 * @param {string | undefined} [from]
	 * @param {*} data
	 */
	receive: function (from, data) {
		if (data === undefined) {
			data = from
			from = undefined
		}

		if (data && data.id in this._inProgress) {
			// this is a reply
			this._inProgress[data.id](data.result)
		}
		else if (data && data.id !== undefined) {
			// this is a request from an other peer
			// reply with our current time
			this.send(from, {
				jsonrpc: '2.0',
				id: data.id,
				result: this.now()
			})
		}
	}

	_handleRPCSendError: function (id, reject, err) {
		delete this._inProgress[id]
		reject(new Error('Send failure'))
	}

	/**
	 * Send a JSON-RPC message and retrieve a response
	 * @param {string} to
	 * @param {string} method
	 * @param {*} [params]
	 * @returns {Promise}
	 */
	rpc: function (to, method, params) {
		const id = util.nextId()
		let resolve, reject
		const deferred = new Promise((res, rej) => {
			resolve = res
			reject = rej
		})

		this._inProgress[id] = function (data) {
			delete this._inProgress[id]

			resolve(data)
		}

		let sendResult 
		
		try {
			sendResult = this.send(to, {
				jsonrpc: '2.0',
				id: id,
				method: method,
				params: params
			}, this.options.timeout)
		} catch(err) {
			this._handleRPCSendError(id, reject, err)
		}

		if (sendResult && (sendResult instanceof Promise || (sendResult.then && sendResult.catch))) {
			sendResult.catch(this._handleRPCSendError.bind(this, id, reject))
		} else {
			console.warn('Send should return a promise')
		}

		return deferred
	}

	/**
	 * Synchronize now with all configured peers
	 * Docs: http://www.mine-control.com/zack/timesync/timesync.html
	 */
	sync: async function () {
		this.emit('sync', 'start')

		const peers = this.options.server ?
			[this.options.server] :
			this.options.peers

		const all = Promise.all(peers.map(peer => this._syncWithPeer(peer)))
		const offsets = all.filter(offset => this._validOffset(offset))
		if (offsets.length > 0) {
			// take the average of all peers (excluding self) as new offset
			this.offset = stat.mean(offsets)
			this.emit('change', this.offset)
		}
		this.emit('sync', 'end')
	}

	/**
	 * Test whether given offset is a valid number (not NaN, Infinite, or null)
	 * @param {number} offset
	 * @returns {boolean}
	 * @private
	 */
	_validOffset: function (offset) {
		return offset !== null && !isNaN(offset) && isFinite(offset)
	}

	/**
	 * Sync one peer
	 * @param {string} peer
	 * @return {Promise.<number | null>}	Resolves with the offset to this peer,
	 *																		or null if failed to sync with this peer.
	 * @private
	 */
	_syncWithPeer: async function (peer) {
		// retrieve the offset of a peer, then wait 1 sec
		const all = []

		function sync () {
			return this._getOffset(peer).then(result => all.push(result))
		}

		function waitAndSync() {
			return util.wait(this.options.delay).then(sync)
		}

		function notDone() {
			return all.length < this.options.repeat
		}

		await sync()
		await util.whilst(notDone, waitAndSync)

		// filter out null results
		const results = all.filter(result => result !== null)

		// calculate the limit for outliers
		const roundtrips = results.map(result => result.roundtrip)
		const limit = stat.std(roundtrips) + stat.median(roundtrips)

		// filter all results which have a roundtrip smaller than the mean+std
		const filtered = results.filter(result => result.roundtrip < limit)
		const offsets = filtered.map(result => result.offset)

		// return the new offset
		return (offsets.length > 0) ? stat.mean(offsets) : null
	}

	/**
	 * Retrieve the offset from one peer by doing a single call to the peer
	 * @param {string} peer
	 * @returns {Promise.<{roundtrip: number, offset: number} | null>}
	 * @private
	 */
	_getOffset: async function (peer) {
		const start = this.options.now() // local system time

		try {
			const timestamp = await this.rpc(peer, 'timesync')
		} catch(err) {
			// just ignore failed requests, return null
			return null
		}

		const end = this.options.now() // local system time
		const roundtrip = end - start
		const offset = timestamp - end + roundtrip / 2 // offset from local system time

		// apply the first ever retrieved offset immediately.
		if (this._isFirst) {
			this._isFirst = false
			this.offset = offset
			this.emit('change', offset)
		}

		return {
			roundtrip: roundtrip,
			offset: offset
		}
	}

	/**
	 * Get the current time
	 * @returns {number} Returns a timestamp
	 */
	now: function () {
		return this.options.now() + this.offset
	}

	/**
	 * Destroy the timesync instance. Stops automatic synchronization.
	 * If timesync is currently executing a synchronization, this
	 * synchronization will be finished first.
	 */
	destroy: function () {
		clearInterval(this._interval)
		this._interval = null
	}

	static defaultOptions = {
		interval: 60 * 60 * 1000, // interval for doing synchronizations in ms. Set to null to disable auto sync
		timeout: 10000,					 // timeout for requests to fail in ms
		delay: 1000,							// delay between requests in ms
		repeat: 5,								// number of times to do a request to one peer
		peers: [],								// uri's or id's of the peers
		server: null,						 // uri of a single server (master/slave configuration)
		now: Date.now						 // function returning the system time
	}

	constructor(options) {
		// apply provided options
		if (options.server && options.peers) {
			throw new Error('Configure either option "peers" or "server", not both.')
		}

		this.options = {...TimeSync.defaultOptions, ...options}

		if typeof this.options.peers === 'string') {
			// split a comma separated string with peers into an array
			this.options.peers = this.options.peers
				.split(',')
				.map(peer => peer.trim())
				.filter(peer => peer !== '')
		}

		if (this.options.interval !== null) {
			// start an interval to automatically run a synchronization once per interval
			this._interval = setInterval(this.sync, this.options.interval)

			// synchronize immediately on the next tick (allows to attach event
			// handlers before the timesync starts).
			setTimeout(function () {
				this.sync().catch(err => emitError(err))
			}, 0)
		}
	}
}
