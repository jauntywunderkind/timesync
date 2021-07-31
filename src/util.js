/**
 * Resolve a promise after a delay
 * @param {number} delay		A delay in milliseconds
 * @returns {Promise} Resolves after given delay
 */
export function wait(delay) {
	return new Promise(function (resolve) {
		setTimeout(resolve, delay)
	})
}

/**
 * Repeat a given asynchronous function a number of times
 * @param {function} fn	 A function returning a promise
 * @param {number} times
 * @return {Promise}
 */
export async function repeat(fn, times) {
	const results = new Array(times)
	for (let i = 0; i < times; ++i) {
		results[i] = await fn()
	}
	return results
}

/**
 * Repeat an asynchronous callback function whilst
 * @param {function} condition	 A function returning true or false
 * @param {function} callback		A callback returning a Promise
 * @returns {Promise}
 */
export async function whilst(condition, callback) {
	while (condition()) {
		await callback()
	}
}

/**
 * Simple id generator
 * @returns {number} Returns a new id
 */
export function nextId() {
	return _id++
}
var _id = 0
