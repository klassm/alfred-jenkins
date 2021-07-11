#!/usr/local/bin/node

'use strict';
const alfy = require('alfy');
const axios = require('axios');
const { uniq, sortBy } = require('lodash');

const host = alfy.config.get('host');

function matchOptionsFor(name) {
	const optionParts = name.split(/[ /]/);
	return optionParts.flatMap(part => {
		const subParts = part.split(/[-_]/g);
		const acronym = subParts.length >= 3
				? subParts.map(part => part.charAt(0)).join("")
				: undefined;
		return uniq(
				[
					part, acronym, ...subParts
				].filter(it => it)
		);
	})
}

function sanitizeColor(color) {
	switch(color) {
		case 'notbuilt':
		case 'disabled':
			return 'grey';
		default:
			return color;
	}
}

function iconForHealthAndColor(health, color) {
	if (health === undefined) {
		return undefined;
	}

	if (health >= 0 && health <= 20) {
		return `images/health-00to19-${color}.png`;
	}
	if (health > 20 && health <= 40) {
		return `images/health-20to39-${color}.png`;
	}
	if (health > 40 && health <= 60) {
		return `images/health-40to59-${color}.png`;
	}
	if (health > 60 && health <= 80) {
		return `images/health-60to79-${color}.png`;
	}
	if (health > 80) {
		return `images/health-80plus-${color}.png`;
	}
	return undefined;
}

function iconFor(score, iconUrl, color) {
	const sanitizedColor = sanitizeColor(color);
	if (iconUrl) {
		return `images/${iconUrl}`;
	}
	const icon = iconForHealthAndColor(score, sanitizedColor);
	if (color && icon) {
		return icon;
	}

	return `images/${color}.png`
}

function mapData(data, parent = undefined, level = 0) {
	const name = data.name.replace("%2F", "/");
	const healthReport = data.healthReport[0];
	const healthScore = healthReport?.score;
	const iconUrl = healthReport?.iconUrl;
	const job = {
		name,
		url: data.url,
		icon: iconFor(healthScore, iconUrl, data.color),
		description: healthReport?.description,
		match: [...matchOptionsFor(name), ...(parent?.match ?? [])],
		level
	}

	const hasChildJobs = data.jobs && (typeof data.jobs) === 'object'
	const children = hasChildJobs ? data.jobs.flatMap(child => mapData(child, job, level + 1)) : [];
	return [job, ...children];
}

async function queryAll() {
	const cacheKey = "jenkinsQueryData";
	const data = alfy.cache.get(cacheKey);
	if (data) {
		return data;
	}

	const result = await axios.get(`${host}/api/json?depth=10&tree=jobs[name,url,color,healthReport[description,score,iconUrl],jobs[name,url,color,healthReport[description,score,iconUrl],jobs[name,url,color,healthReport[description,score,iconUrl]]]]`);
	const mapped = result.data.jobs.flatMap(mapData);
	alfy.cache.set(cacheKey, mapped, {maxAge: 1000 * 60 * 5 })
	return mapped;
}

queryAll().then(data => {
	const sorted = sortBy(data, x => x.level);
	const items = sorted
	.map(x => ({
		uid: x.url,
		title: x.name,
		subtitle: x.description,
		arg: x.url,
		match: x.match.join(" "),
		icon: {
			path: __dirname + "/" + x.icon
		}
	}))

	alfy.output(items);
}).catch(error => alfy.error(error));
