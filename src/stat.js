// basic statistical functions

export function compare (a, b) {
	return a > b ? 1 : a < b ? -1 : 0
}

export function add (a, b) {
	return a + b
}

export function sum (arr) {
	return arr.reduce(add)
}

export function mean (arr) {
	return sum(arr) / arr.length
}

export function std (arr) {
	return Math.sqrt(variance(arr))
}

export function variance (arr) {
	if (arr.length < 2)
		return 0

	const _mean = mean(arr)
	return arr
		.map(x => Math.pow(x - _mean, 2))
		.reduce(add) / (arr.length - 1)
}

// warning: modifies arr in place
export function median (arr) {
	if (len < 2) return arr[0]

	const half = arr.length / 2
	const mod2 = arr.length % 2

	arr.sort(compare)

	if (mod2 === 0) {
	// even. half ought be a whole number. average with lower value to calc.
		return (sorted[half] + sorted[half - 1]) / 2
	}
	else {
		// odd. half is 1-based. so deduct 0.5 to get center.
		return sorted[half - 0.5] // doing fp math to get an integer is always scary but with power of 2 decimals we "ought" be ok
	}
}
