#!/usr/bin/env deno run --allow-all
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";
import { TextLineStream } from "https://deno.land/std/streams/text_line_stream.ts";
import * as toml from "jsr:@std/toml";
import Task from "https://esm.sh/data.task";
import LogseqPage from "./libs/logseq-page.js";

const isWindows = Deno.build.os === "windows";

const orientSlashes = isWindows ? function (path) {
  return path ? path.replaceAll("/", "\\") : null;
} : function (path) {
  return path ? path.replaceAll("\\", "/") : null;
}

const HOME = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
const NOTE_CONFIG = orientSlashes(Deno.env.get("NOTE_CONFIG") ?? `${HOME}/.config/nt/config.toml`);

class Guidance extends Error {
  constructor(message) {
    super(message);
    this.name = "Guidance";
    this.stack = `${this.name}: ${message}`;
  }

  toString(){
    return this.message;
  }
}

function explain(message, cause){
  return cause instanceof Guidance ? cause : new Error(message, {cause});
}

function tskConfig(path){
  function expandLogseq(logseq){
    const token = Deno.env.get('LOGSEQ_TOKEN') || null;
    if (!token) {
      throw new Guidance("LOGSEQ_TOKEN environment var must be set.");
    }
    const repo = logseq?.repo?.replace("~", HOME);
    if (!repo) {
      throw new Guidance(`Logseq repo must be set in config at ${path}.`);
    }
    const endpoint = "http://127.0.0.1:12315/api";
    return {endpoint, token, ...logseq, repo};
  }
  function expandConfig(config){
    const logseq = expandLogseq(config?.logseq ?? {});
    return { ...config, logseq };
  }
  return new Task(async function(reject, resolve){
    try {
      const existing = await exists(path);
      if (!existing) {
        throw new Guidance(`Note config not present at ${path}.`);
      }

      const text = await Deno.readTextFile(existing);
      const config = expandConfig(toml.parse(text));

      resolve(config);
    } catch (cause) {
      reject(explain(`Problem reading config at ${path}.`, cause));
    }
  });
}

const comp = (...fns) => (...args) =>
  fns.reduceRight((acc, fn, i) =>
    i === fns.length - 1 ? fn(...acc) : fn(acc),
  args);

function promise(tsk){
  return new Promise(function(resolve, reject){
    tsk.fork(reject, resolve);
  });
}

const loadConfig = comp(promise, tskConfig);

function println(lines){
  const lns = Array.isArray(lines) ? lines : lines == null ? [] : [lines];
  lns.forEach(line => console.log(line))
}

function abort(error){
  if (error) {
    console.error(error instanceof Guidance ? String(error) : error);
  }
  Deno.exit(error ? 1 : 0);
}

const config = await loadConfig(NOTE_CONFIG).catch(abort);

function take(n){
  return n == null ? xs => xs : function(xs){
    return xs.slice(0, n);
  };
}

function all (tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return Task.of([]);
  }

  return new Task((reject, resolve) => {
    const results = new Array(tasks.length);
    let completed = 0;
    let hasRejected = false;
    const cleanups = [];

    // Handle individual task completion
    const handleComplete = (index, result) => {
      if (hasRejected) return;

      results[index] = result;
      completed++;

      if (completed === tasks.length) {
        resolve(results);
      }
    };

    // Handle individual task rejection
    const handleReject = (error) => {
      if (hasRejected) return;

      hasRejected = true;
      reject(error);

      // Clean up all remaining tasks
      cleanups.forEach(cleanup => cleanup && cleanup());
    };

    // Fork all tasks
    tasks.forEach((task, index) => {
      const cleanup = task.fork(
        (error) => handleReject(error),
        (result) => handleComplete(index, result)
      );
      cleanups.push(cleanup);
    });

    // Return cleanup function
    return () => {
      hasRejected = true;
      cleanups.forEach(cleanup => cleanup && cleanup());
    };
  });
};

function juxt(...fns){
  return function(x){
    return Task.all(fns.reduce(function(memo, f){
      memo.push(f(x));
      return memo;
    }, []));
  }
}

Task.all = all;
Task.juxt = juxt;

function fmt({format}){
  return function(results){
    if (format === "json") {
      return results ? JSON.stringify(results, null, 2) : null;
    } else {
      return results;
    }
  }
}

function toInt(s) {
  try {
    return typeof s === 'string' && /^-?\d+$/.test(s) ? Number(s) : null
  } catch {
    return null;
  }
}

function getLogger(debug = false) {
  return debug ? console : { log: () => null };
}

function tskNormalizedName(name){
  return tskLogseq('logseq.Editor.getPage', [toInt(name) || name]).map(page => page?.originalName);
}

const getNormalizedName = comp(promise, tskNormalizedName);

function tskJournalDay(name){
  return tskLogseq('logseq.Editor.getPage', [name]).map(function(page){
    if (!page) return false;
    const { journalDay } = page;
    return journalDay;
  });
}

const journalDay = comp(promise, tskJournalDay);

async function exists(path){
  try {
    await Deno.stat(path);
    return path
  } catch {
    return null;
  }
}

function encode(name){
  return name ?
    encodeURIComponent(name).
      replaceAll("%20", " ").
      replaceAll("%2C", ",").
      replaceAll(/\./g, "%2E") :
    null;
}

function datestamp(dt = new Date()){
  return dt.toISOString().slice(0, 10);
}

function isDatestamp(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str);
}

function withWeekday(ymd) {
  const d = new Date(ymd);
  const day = d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${ymd} ${day}`;
}

function formatYYYYMMDD(n) {
  const s = String(n).padStart(8, '0')
  return s.slice(0, 4) + '_' + s.slice(4, 6) + '_' + s.slice(6, 8)
}

function getFilePath(day, name){
  const where = day ? "journals" : "pages";
  const normalized = day ? formatYYYYMMDD(day) : encode(name.trim());
  return `${config.logseq.repo}/${where}/${normalized}.md`;
}

function tskGetJournalPage(datestamp){
  return new Task(function(reject, resolve){
    const arg = datestamp.split(' ')?.[0].replaceAll("-", "");
    qry(`[:find (pull ?p [*]) :where [?p :block/journal-day $1]]`, arg).fork(reject, function(result){
      const obj = result?.[0]?.[0] || {};
      resolve(obj["journal?"] ? obj["original-name"] : null);
    });
  });
}

const getJournalPage = comp(promise, tskGetJournalPage);

function tskIdentify(given){
  return given ? new Task(async function(reject, resolve){
    try {
      const journal = given.match(/(\d{4})-?(\d{2})-?(\d{2})(?!\d)/);
      const normalized = await getNormalizedName(given) || (journal ? await getJournalPage(given) : null);
      const alias = normalized ? await aka(normalized) : null;
      const name = alias || normalized || given;
      const day = journal ? parseInt(journal[1] + journal[2] + journal[3]) : await journalDay(name);
      const path = name ? getFilePath(day, name) : null;
      const identifiers = { given, day, normalized, name, path };
      //console.log({identifiers})
      resolve(identifiers);

    } catch (ex) {
      reject(ex);
    }
  }) : Task.rejected(new Error('Page name is required'));
}

const identify = comp(promise, tskIdentify);

function tskLogseq(method, args){
  return new Task(async function(reject, resolve){
    try {
      const payload = { method }
      if (args) {
        payload.args = args
      }

      const response = await fetch(config.logseq.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.logseq.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result?.error) {
        throw new Error(result.error);
      }

      resolve(result);

    } catch (ex) {
      reject(ex);
    }
  });
}

const callLogseq = comp(promise, tskLogseq);

function qryPrerequisites(name){
  return new Task(function(reject, resolve){
    qry(`[:find (pull ?p [:block/properties :block/original-name]) :where [?p :block/original-name "$1"]]`, name).fork(reject, function(results){
      resolve(results?.[0]?.[0]?.properties?.prerequisites || []);
    });
  });
}

function tskPrerequisites(name){
  return name ? new Task(async function(reject, resolve){
    const seen = new Set();
    const result = [];

    async function dfs(given) {
      const { name } = await identify(given);
      if (!name) return;

      if (seen.has(name)) return;          // dedupe + short-circuit

      seen.add(name);
      result.push(name);                   // keep "first name comes up top" order

      const prereqs = await promise(qryPrerequisites(name));
      for (const prereqName of prereqs) {
        await dfs(prereqName);             // nesting until leaf nodes
      }
    }

    try {
      await dfs(name);
    } catch (ex) {
      reject(ex);
    }
    resolve(result);
  }) : Task.of(null);
}

// Helper function to call wipe command logic
function tskWipe(pageName, options) {
  const logger = getLogger(options.debug || false);
  return new Task(async function(reject, resolve) {
    logger.log(`Wiping content from page '${pageName}'...`);

    try {
      if (!pageName) {
        throw new Error("Page name must be specified");
      }

      // Check if page exists
      const pageCheck = await callLogseq('logseq.Editor.getPage', [pageName]);

      if (!pageCheck || !pageCheck.uuid) {
        // Page doesn't exist, no need to wipe
        resolve({ deletedCount: 0, propertiesCount: 0, alreadyEmpty: true });
        return;
      }

      const pageUuid = pageCheck.uuid;
      logger.log(`Page exists with UUID: ${pageUuid}`);

      // Get all page blocks
      const blocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

      if (!blocks || blocks.length === 0) {
        resolve({ deletedCount: 0, propertiesCount: 0, alreadyEmpty: true });
        return;
      }

      // Find blocks to delete (those without meaningful properties)
      const blocksToDelete = [];
      const propertiesBlocksFound = [];

      for (const block of blocks) {
        let hasRealProperties = false;

        if (block.properties && typeof block.properties === 'object' && Object.keys(block.properties).length > 0) {
          if (block.content !== "" && block.content !== null) {
            hasRealProperties = true;
          }
        }

        if (hasRealProperties) {
          propertiesBlocksFound.push(block);
          logger.log(`Found properties block, keeping: ${block.uuid}`);
        } else {
          blocksToDelete.push(block);
          logger.log(`Marked for deletion: ${block.uuid} - content: '${block.content}'`);
        }
      }

      if (blocksToDelete.length === 0) {
        resolve({ deletedCount: 0, propertiesCount: propertiesBlocksFound.length, alreadyEmpty: true });
        return;
      }

      logger.log(`Found ${blocksToDelete.length} blocks to delete`);
      logger.log(`Found ${propertiesBlocksFound.length} properties blocks to keep`);

      // Delete each non-property block
      let deletedCount = 0;
      for (const block of blocksToDelete) {
        logger.log(`Deleting block: ${block.uuid}`);

        try {
          const deleteResponse = await callLogseq('logseq.Editor.removeBlock', [block.uuid]);

          if (deleteResponse === null) {
            deletedCount++;
            logger.log(`Deleted block: ${block.uuid}`);
          } else {
            logger.log(`Failed to delete block: ${block.uuid}`);
          }
        } catch (error) {
          logger.log(`Failed to delete block: ${block.uuid} - ${error.message}`);
        }
      }

      const result = {
        deletedCount,
        propertiesCount: propertiesBlocksFound.length,
        totalCount: blocksToDelete.length,
        alreadyEmpty: false
      };

      logger.log(`Wiped ${deletedCount} content blocks from page '${pageName}' (preserved ${propertiesBlocksFound.length} property blocks)`);

      resolve(result);

    } catch (error) {
      reject(error);
    }
  });
}

const wipeCommand = comp(promise, tskWipe);

function pipeable(g){
  return async function (options, ...args){
    const f = g(options);
    await incoming(async function(arg){
      await promise(f(arg, ...args).map(fmt(options))).catch(abort).then(println);
    }, async function(){
      await promise(f(...args).map(fmt(options))).catch(abort).then(println);
    });
  }
}

const nonBlankLines = {
  transform: (line, c) => line.trim() && c.enqueue(line)
}

async function incoming(one, only) {
  if (Deno.isatty(Deno.stdin.rid)) {   // If stdin is a TTY, no piping is happening
    await only();
    return;
  }

  const streamed = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream())
    .pipeThrough(new TransformStream(nonBlankLines));

  let received = false;
  try {
    for await (const line of streamed) {
      await one(line);
      received = true;
    }
  } finally {
    if (!received) {
      await only();
    }
  }
}

function normalizeSeparator(parts){
  return (parts.join("\n").trim() + "\n").split("\n");
}

function wikified(value) {
  return value.includes(' ') ? `[[${value}]]` : value;
}

async function prop(options) {
  const props = /^([^\s:]+):: (.+)/;
  const consolidatedAdds = {};
  const consolidatedRemoves = {};
  const processedKeys = new Set();

  // Gather and consolidate additions
  if(options.add && Array.isArray(options.add)){
    for(const add of options.add){
      const [key, value] = add.split("=");
      if(key && value) {
        if(!consolidatedAdds[key]) consolidatedAdds[key] = [];
        consolidatedAdds[key].push(value);
      }
    }
  }

  // Gather and consolidate removals
  if(options.remove && Array.isArray(options.remove)){
    for(const remove of options.remove){
      const [key, value] = remove.split("=");
      if(key && value) {
        if(!consolidatedRemoves[key]) consolidatedRemoves[key] = [];
        consolidatedRemoves[key].push(value);
      }
    }
  }

  const input = await new Response(Deno.stdin.readable).text();
  const lines = input.split('\n');
  const output = [];

  // First, output heading line if there is one
  let lineIndex = 0;
  if (lines[0] && lines[0].startsWith('#')) {
    output.push(lines[0]);
    lineIndex = 1;
  }

  // Skip any empty lines after heading
  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    output.push(lines[lineIndex]);
    lineIndex++;
  }

  // Process property lines
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    const m = line.match(props);

    if (m) {
      // Process property line
      const [, key, values] = m;
      processedKeys.add(key);

      // Apply removals
      let currentValues = values.split(', ').filter(v => v.trim());
      if (consolidatedRemoves[key]) {
        currentValues = currentValues.filter(v => !consolidatedRemoves[key].includes(v));
      }

      // Apply additions (deduplicate)
      if (consolidatedAdds[key]) {
        for (const value of consolidatedAdds[key]) {
          if (!currentValues.includes(value)) {
            currentValues.push(wikified(value));
          }
        }
      }

      // Output modified property line if we still have values
      if (currentValues.length > 0) {
        const formattedValues = currentValues.map(wikified);
        output.push(`${key}:: ${currentValues.join(', ')}`);
      }

      lineIndex++;
    } else {
      // We've reached the end of properties
      break;
    }
  }

  // Output unprocessed add operations as new properties
  for (const [key, values] of Object.entries(consolidatedAdds)) {
    if (!processedKeys.has(key)) {
      const formattedValues = values.map(wikified);
      output.push(`${key}:: ${formattedValues.join(', ')}`);
      processedKeys.add(key);
    }
  }

  // Skip any empty lines between properties and content
  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    output.push(lines[lineIndex]);
    lineIndex++;
  }

  // Output rest of content unchanged
  while (lineIndex < lines.length) {
    output.push(lines[lineIndex]);
    lineIndex++;
  }

  console.log(output.join('\n'));
}

function tskGetPage(given, options) {
  const {keep, fixed} = LogseqPage.selects(options, config);
  return given ? new Task(async function(reject, resolve){
    try {
      const {name, path} = await identify(given);

      if (!name) {
        resolve(null);
        return;
      }

      if (options.format === 'md' && keep == null) {
        const found = await exists(path);
        if (!found) {
          resolve(null);
          return;
        }

        const content = (await Deno.readTextFile(path)).replace(/\s+$/, '');
        resolve(content);
        return;
      }

      const blocks = (await callLogseq('logseq.Editor.getPageBlocksTree', [name])) || [];
      const content = options.format === "md" ? LogseqPage.stringify(blocks, keep, fixed) : blocks;

      resolve(content);

    } catch (ex) {
      reject(ex);
    }
  }) : Task.of(null);
}

function page(options){
  return function(given){
    return given ? tskNamed(given).
      chain(Task.juxt(Task.of, name => tskGetPage(name, options))).
      map(fmtBody(options)) : Task.of(null);
  }
}

function ident(){
  return function(given){
    return given ? tskIdentify(given).
      map(obj => console.log(JSON.stringify(obj, null, 2))) : Task.of(null);
  }
}

function search(term){
  return new Task(function(reject, resolve){
    tskLogseq('logseq.Editor.search', [term]).
      fork(reject, async function(result){
        const pageIds = new Set()
        result?.
          blocks?.
          map(block => block['block/page']).
          forEach(id => pageIds.add(id));

        const pageNames =
          await Promise.all(Array.from(pageIds).
            map(async function(id){
              try {
                const pageResult = await callLogseq('logseq.Editor.getPage', [id]);
                return pageResult?.originalName;
              } catch (cause) {
                reject(new Error(`Could not get page ${id}.`, {cause}));
              }
            }));

        resolve(pageNames);
      });
  });
}

function tskPath(name){
  return tskIdentify(name).map(({path}) => orientSlashes(path));
}

function tskNamed(id){
  return tskIdentify(id).map(({name}) => name);
}

function constantly(f){
  return function(){
    return f;
  }
}

const path = constantly(tskPath);

function tags(options){
  return has(options, "tags");
}

function alias(options){
  return has(options, "alias");
}

const aka = comp(async function(results){
  const result = await results;
  return result?.[0];
}, promise, alias({format: "md"}));

function qryProps(prop, vals, mode = "any"){
  return new Task(function(reject, resolve){
    try {
      if (!['any', 'all'].includes(mode)){
        throw new Error(`Mode must be "any" or "all" and was "${mode}".`);
      }
      if (vals.length === 0) {
        throw new Error('At least one prop value is required');
      }
      const conditions = vals.map(val => `[(contains? ?prop "${val}")]`).join(' ');
      const whereClause = mode === 'any' ? `(or ${conditions})` : conditions;
      return qry(`[:find (pull ?page [:block/original-name])
                    :where
                    [?page :block/properties ?props]
                    [(get ?props :${prop}) ?prop]
                    ${whereClause}]`).
        fork(reject, function(results){
          const names = results.map(([item]) => item?.["original-name"]).filter(name => name);
          resolve(names);
        });
    } catch (error) {
      reject(error);
    }
  })
}

function has(options, prop = null){
  if (options.all && options.any) {
    abort(new Guidance('--all and --any options are mutually exclusive'));
  }

  function qry(prop, ...vals){
    return qryProps(prop, vals, options.any ? 'any' : 'all');
  }

  return prop ? qry.bind(null, prop) : qry;
}

function qryBacklinks(name, limit = Infinity){
  return new Task(async function(reject, resolve){
    try {
      if (!name) {
        throw new Error('Page name is required');
      }

      const items = await promise(qry(`[:find (pull ?b [:block/content :block/page]) :where [?b :block/path-refs ?p] [?p :block/name "$1"]]`, name.toLowerCase()).map(take(limit)));

      const pageIds = new Set()
      items?.forEach(item => {
        const block = item?.[0];
        if (block?.page?.id) {
          pageIds.add(block.page.id);
        }
      });

      // Get page details for each unique page ID
      const pageNames = new Set()
      for (const pageId of pageIds) {
        try {
          const pageResult = await callLogseq('logseq.Editor.getPage', [pageId])
          if (pageResult && pageResult.originalName) {
            pageNames.add(pageResult.originalName);
          }
        } catch (cause) {
          throw new Error(`Could not get page ${pageId}.`, {cause});
        }
      }

      resolve(Array.from(pageNames));

    } catch (error) {
      reject(error);
    }
  });
}

function backlinks(options){
  return function(name){
    return qryBacklinks(name, options.limit);
  }
}

function query(options){
  return function(query, ...args){
    //console.log({limit, options, query, args});
    return qry(query, ...args)
      .map(take(options.limit))
      .map(results => options.flatten ? results.flat() : results);
  }
}

function qry(template, ...args){
  const query = config?.query?.[template] ?? template;
  return new Task(function(reject, resolve){
    const q = args.reduce(function(q, value, idx){
      return q.replaceAll(`$${idx + 1}`, value);
    }, query);
    const placeholder = /\$(\d+)/g;
    const params = query.search(placeholder) !== -1;
    const ready = q.search(placeholder) === -1;
    if (!ready) {
      reject(new Guidance(`Supply placeholders: ${q}`));
    } else {
      //console.log({q, args, params})
      tskLogseq('logseq.DB.datascriptQuery', params ? [q] : [q, ...args]).fork(reject, resolve);
    }
  });
}

function qryPage(name){
  return qry(`[:find (pull ?p [*]) :where [?p :block/original-name "$1"]]`, name);
}

function fmtProps({format}, propName = null){
  return function([name, results]){
    const pageData = results[0]?.[0] || null;

    if (format === 'json') {
      return [name, pageData ? results : null];
    } else if (format === 'md') {
      try {
        const props = propName ? pageData?.properties?.[propName] || null : Object.entries(pageData?.["properties-text-values"] ?? {}).map(function([key, vals]){
          return `${key}:: ${vals}`;
        });
        return [name, props.length? props : null];
      } catch {
        return [name, null];
      }
    } else {
      throw new Error(`Unknown format: ${format}`);
    }
  }
}

function fmtBody({heading, format, vacant}){
  return function([name, content]){
    if (format === 'json') {
      return [name, content];
    } else if (format === 'md') {
      const lines = [];
      const furniture = heading && name && (vacant || content);
      if (furniture) {
        lines.push(`${'#'.repeat(heading)} ${name}`.trim());
      }
      if (content) {
        typeof content == 'object' ? lines.push(...content) : lines.push(content);
      }
      if (furniture) {
        lines.push("");
      }
      return lines;
    }
  }
}

function props(options){
  return function(given, propName = null){
    return given ? tskNamed(given).
      chain(Task.juxt(Task.of, qryPage)).
      map(fmtProps(options, propName)).
      map(fmtBody(options)) : Task.of(null);
  }
}

//TODO handle `notes props Assisting` with or without piping
function demand(...whats){
  return /*isPiped ?*/ whats.map(what => `[${what}]`).join(' ') /*: whats.map(what => `<${what}>`).join(' ')*/;
}

function tskGetAllPages({type = "regular", limit = Infinity} = {}){
  const filters = {"journal": item => !!item["journal?"], "regular": item => !item["journal?"]}
  const f = filters[type];
  const filter = f ? results => results.filter(f) : results => results;
  return tskLogseq('logseq.Editor.getAllPages')
    .map(filter)
    .map(results => results.map(page => page?.originalName))
    .map(take(limit));
}

async function wipe(options, pageName){
  try {
    const result = await wipeCommand(pageName, options);

    if (result.alreadyEmpty) {
      if (result.propertiesCount > 0) {
        console.log(`✅ Page '${pageName}' already only contains properties`);
      } else {
        console.log(`✅ Page '${pageName}' is already empty`);
      }
      return;
    }

    if (result.deletedCount === result.totalCount) {
      console.log(`✅ Wiped ${result.deletedCount} content blocks from page '${pageName}' (preserved ${result.propertiesCount} property blocks)`);
    } else {
      throw new Error(`Only deleted ${result.deletedCount} out of ${result.totalCount} blocks`);
    }

  } catch (error) {
    abort(error);
  }
}

async function proposed(given) {
  return await promise(tskNamed(given)) ?? given;
}

async function write(options, given) {
  try {
    const { path } = await identify(given);

    const create = !(await exists(path))

    if (!create && !options.overwrite) {
      throw new Guidance(`Page '${path}' already exists`);
    }

    const file = await Deno.open(path, {
      write: true,
      create,
      truncate: true
    })

    await Deno.stdin.readable.pipeTo(file.writable)
  } catch (error) {
    abort(error)
  }
}

async function update(options, name){
  const prependMode = options.prepend || false;
  const overwriteMode = options.overwrite || false;
  const logger = getLogger(options.debug || false);
  const pageName = await proposed(name ?? datestamp());

  logger.log(`Page: ${pageName}, Prepend: ${prependMode}, Overwrite: ${overwriteMode}`);

  // Parse JSON payload
  let parsedPayload;
  try {
    const payload = await new Response(Deno.stdin.readable).text();

    if (!payload) {
      throw new Error("No payload received from stdin.");
    }

    parsedPayload = JSON.parse(payload);
  } catch (cause) {
    abort(new Error(`Error receiving payload.`, {cause}));
  }

  // Call purge if overwrite mode is enabled
  if (overwriteMode) {
    logger.log("Overwrite mode enabled, purging page first...");

    try {
      await wipeCommand(pageName, options);
    } catch (error) {
      logger.log(`Warning: Purge had issues, continuing with overwrite... ${error.message}`);
      // Continue with overwrite even if purge had issues
    }
  }

  // Check if page exists and get page info
  let pageCheck;
  try {
    pageCheck = await callLogseq('logseq.Editor.getPage', [pageName]);

  } catch (error) {
    abort(`Error checking page existence: ${error.message}`);
  }

  logger.log(`Page check result: ${JSON.stringify(pageCheck)}`);

  let insertResponse;

  if (pageCheck && pageCheck.uuid) {
    // Page exists
    const pageUuid = pageCheck.uuid;
    logger.log(`Page exists with UUID: ${pageUuid}`);

    if (prependMode) {
      logger.log("Prepending content...");

      // Get all page blocks to check for properties
      const blocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

      // Find the last block with properties
      let lastPropertiesBlock = null;
      if (blocks && Array.isArray(blocks)) {
        for (const block of blocks) {
          if (block.properties && Object.keys(block.properties).length > 0) {
            lastPropertiesBlock = block;
          }
        }
      }

      if (lastPropertiesBlock) {
        logger.log(`Found properties, inserting after them...`);
        logger.log(`Properties content: ${lastPropertiesBlock.content}`);

        // Insert after the properties block using sibling:true
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          lastPropertiesBlock.uuid,
          parsedPayload,
          { sibling: true }
        ]);
      } else {
        logger.log("No properties found, prepending to top...");

        // Prepend using page UUID with {sibling: false, before: true}
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          pageUuid,
          parsedPayload,
          { sibling: false, before: true }
        ]);
      }
    } else {
      logger.log("Appending content...");

      const blocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

      if (blocks && Array.isArray(blocks) && blocks.length > 0) {
        const lastBlockUuid = blocks[blocks.length - 1].uuid;
        logger.log(`Appending after block: ${lastBlockUuid}`);

        // Append after last block using sibling:true
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          lastBlockUuid,
          parsedPayload,
          { sibling: true }
        ]);
      } else {
        logger.log("Page is empty, inserting at top...");

        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          pageUuid,
          parsedPayload,
          { sibling: false }
        ]);
      }
    }
  } else {
    // Page doesn't exist, create it
    logger.log("Page doesn't exist, creating new page...");

    const createResponse = await callLogseq('logseq.Editor.createPage', [pageName, {}]);

    if (createResponse && createResponse.uuid) {
      const pageUuid = createResponse.uuid;
      logger.log(`Created page with UUID: ${pageUuid}`);

      // Insert into new page using page UUID
      insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
        pageUuid,
        parsedPayload,
        { sibling: false }
      ]);
    } else {
      abort("Error creating page");
    }
  }

  // Check if insertion was successful
  if (insertResponse === null) {
    const blockCount = Array.isArray(parsedPayload) ? parsedPayload.length : 1;
    const action = prependMode ? "Prepended" : "Appended";
    console.log(`✅ ${action} ${blockCount} blocks to page '${pageName}'`);
  } else if (Array.isArray(insertResponse)) {
    const blockCount = insertResponse.length;
    const action = prependMode ? "Prepended" : "Added";
    console.log(`✅ ${action} ${blockCount} blocks to page '${pageName}'`);
  } else {
    abort("Error creating page");
  }
}

async function parse(){
  const input = await new Response(Deno.stdin.readable).text();

  if (!input.trim()) {
    console.error("Error: No input provided via stdin");
    Deno.exit(1);
  }

  const blocks = LogseqPage.parse(input);
  console.log(JSON.stringify(blocks, null, 2));
}

function pages(options){
  return constantly(tskGetAllPages(options));
}

const PIPEABLE = `📨`;
const PIPED = `📥`;

const program = new Command()
  .name('nt')
  .description(`A general-purpose tool for interacting with Logseq content.

 ${PIPEABLE} = supply primary argument directly or pipe them in
 ${PIPED} = pipeline-only operations

`.trim())
  .version('1.0.0-beta')
  .stopEarly();

program
  .command('pages')
  .description(`List pages`)
  .option('-t, --type <type:string>', 'Page type (regular|journal|all)', 'regular')
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .option('--limit <type:integer>', 'Limit to N entries (none = no limit) (default: "none")', Infinity)
  .example("List regular pages", "nt pages")
  .example("List regular and journal pages", "nt pages -t all")
  .example("List regular pages as json", "nt pages --json")
  .action(pipeable(pages));

program
  .command('page')
  .alias('p')
  .description(`Get page ${PIPEABLE}`)
  .arguments(demand("name|datestamp"))
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', {default: 'md'})
  .option('--json', 'Output JSON format')
  .option('--heading <level:number>', 'Heading level (0-5, where 0=no heading)', {default: 1})
  .option('--vacant', 'Include vacant entries')
  .option('-l, --less [patterns:string]', 'Less content matching regex patterns', { collect: true })
  .option('-o, --only [patterns:string]', 'Only content matching regex patterns', { collect: true })
  .example("List wikilinks on a page", "nt page Mission | nt wikilinks")
  .example("Show content for wikilinked pages", "nt page Mission | nt wikilinks | nt page")
  .example("Show content for select pages", `nt list Atomic "Clojure Way" | nt page`)
  .example("Show content minus bare and md links", `nt page "Start With Why" --less '^https?://[^)]+$' --less '^\[.*\]\(https?://[^)]+\)$'`)
  .example("Show only bare and md links", `nt page "Start With Why" --only '^https?://[^)]+$' --only '^\[.*\]\(https?://[^)]+\)$'`)
  .example("Show content minus tasks", `nt page Atomic --less '^(TODO|DOING|DONE|WAITING|NOW|LATER)'`)
  .example("Show only tasks", `nt page Atomic --only '^(TODO|DOING|DONE|WAITING|NOW|LATER)'`)
  .example("Show content minus filters", `nt page Atomic --less tasks --less links`)
  .example("Show only content for filters", `nt page Atomic --only tasks --only links`)
  .example("Show agent-facing content per filters", `nt page Atomic --less`)
  .example("Show human-facing content per filters", `nt page Atomic --only`)
  .example(`Find mention of "components" on a page`, `nt page Atomic | grep -C 3 components`)
  .example(`Show journal page for select date, no heading`, `nt p --heading=0 2025-12-03`)
  .action(pipeable(page));

program
  .command('post')
  .description(`Sends content to page or, if omitted, to today's journal entry ${PIPED}`)
  .arguments("[name] [content]")
  .option('-a, --append', 'Append mode (the default if omitted)')
  .option('-p, --prepend', 'Prepend mode')
  .option('--overwrite', 'Purges any existing page content (not properties)')
  .option('--debug', 'Enable debug output')
  .example("Append content to current journal page", `echo "Walked for 1h" | nt post`)
  .example("Append item to target page", `nt post Diet "Egg sandwich"`)
  .example("Append list of items to target page", `nt list Milk Bread Eggs" | nt post Groceries`)
  .example("Replace target page", `nt post Groceries "Ranch Dressing\\nCream Cheese\\nBuffalo Sauce\\nChicken" --overwrite`)
  .example("Prepend block to target page", `nt post Call "Mom" --prepend`)
  .example(`Clone a page`, `nt p --heading=0 "Recipe Template" | nt post Lasagna`);

program
  .command('update')
  .hidden()
  .description(`Append blocks to page from stdin  ${PIPED}`)
  .arguments("[name]")
  .option('-p, --prepend', 'Prepend instead of append')
  .option('--debug', 'Enable debug output')
  .option('--overwrite', 'Purge any existing page content (not properties)')
  .action(update);

program
  .command('write')
  .description(`Write page from stdin`)
  .arguments("<name>")
  .option('--overwrite', 'Purge existing page content')
  .action(write);

program
  .command('wipe')
  .description('Wipe content, but not properties, from a page')
  .arguments(demand("name"))
  .option('--debug', 'Enable debug output')
  .action(wipe);

program
  .command('tags')
  .alias('t')
  .description(`List pages with all the given tags ${PIPEABLE}`)
  .arguments(demand("tags..."))
  .option('--all', 'Require all tags to be present (default)')
  .option('--any', 'Require any tag to be present')
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .example("List names of pages tagged Writing", "nt tags Writing")
  .example("Show content of pages tagged Writing", "nt tags Writing | nt page")
  .example("List pages tagged Writing and Editing", "nt tags Writing Editing")
  .example("List pages tagged Writing or Editing", "nt tags Writing Editing --any")
  .example("List pages tagged Writing and Editing, explicit", "nt tags Writing Editing --all")
  .example("Normalize a tag then find pages tagged with it", "nt name writing | nt tags")
  .example("Normalize tags then find pages tagged with either", "nt l writing editing | nt n | nt tags")
  .example("List pages with tags, piped in", `nt list Atomic Clojure\ Way | nt tags`)
  .example("List pages with tags, directly", `nt tags Atomic & nt tags Clojure\ Way`)
  .example("List pages with tags, args expansion", `printf "%s\\n" Atomic Clojure\ Way | xargs -I {} nt tags {}`)
  .example("List pages with tags, pwsh", `'Atomic', 'Clojure Way' | % { nt tags $_ }`)
  .action(pipeable(tags));

program
  .command('has')
  .alias('h')
  .description(`List pages having a given prop with value(s) ${PIPEABLE}`)
  .arguments(demand("prop", "vals..."))
  .option('--all', 'Require ALL tags to be present (default)')
  .option('--any', 'Require ANY tag to be present')
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .action(pipeable(has));

program
  .command('prereq')
  .description(`Recursively list page prerequisites ${PIPEABLE}`)
  .arguments(demand("name"))
  .action(pipeable(constantly(tskPrerequisites)))
  .example("List several pages and their unique prerequisites", `nt list Coding Tasking Decomposing | nt prereq | nt seen | nt page`)
  .example("List properties for all prerequisites for a topic", `nt prereq Coding | xargs -I {} nt props {} --vacant`);

program
  .command('path')
  .description(`The path to the page file ${PIPEABLE}`)
  .arguments(demand("name"))
  .example("Display the file system path to the page", `nt path "Article Ideas"`)
  .example(`Open Moussaka page for editing in VS Code`, `nt path Moussaka | xargs code`)
  .example("Undoing recent changes, human or agent, to select page", "nt path Moussaka | xargs git restore")
  .action(pipeable(path));

program
  .command('props')
  .description(`Get page properties ${PIPEABLE}`)
  .arguments(demand("name", "property"))
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', {default: 'md'})
  .option('--desc', "With description")
  .option('--json', 'Output JSON format')
  .option('--heading <level:number>', 'Heading level (0-5, where 0=no heading)', {default: 1})
  .option('--vacant', 'Include vacant entries')
  .example("Show tags on certain pages, piped in", `nt list Atomic "Clojure Way" | nt props tags`)
  .example("Show tags on certain pages, directly", `nt props Atomic tags & nt props "Clojure Way" tags`)
  .example("Show tags on certain pages, args expansion", `printf "%s\\n" Atomic "Clojure Way" | xargs -I {} nt props {} tags`)
  .example("Show tags on certain pages, pwsh", `'Atomic', 'Clojure Way' | % { nt props $_ tags }`)
  .action(pipeable(props));

program
  .command('search')
  .alias('s')
  .description(`Search pages ${PIPEABLE}`)
  .arguments(demand("term"))
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .action(pipeable(constantly(search)));

program
  .command('name')
  .alias('n')
  .description(`Get page name as cased from page ID or case-insensitive name. ${PIPEABLE}`)
  .arguments(demand("id|name"))
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .example("Get the actual casing of a page name via stdin", `echo "writing voice" | nt n`)
  .example("Get the actual casing of a page name", `nt n "writing voice"`)
  .action(pipeable(constantly(tskNamed)));

program
  .command('ident')
  .hidden()
  .description(`Get page identity details ${PIPEABLE}`)
  .arguments(demand("id|name"))
  .action(pipeable(ident));

program
  .command('alias')
  .description(`Get page name from alias ${PIPEABLE}`)
  .arguments(demand("alias"))
  .action(pipeable(alias));

program
  .command('backlinks')
  .alias('b')
  .description(`List pages that link to a given page ${PIPEABLE}`)
  .arguments(demand("name"))
  .option('--limit <type:integer>', 'Limit to N entries (omit for no limit)', {default: Infinity})
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .action(pipeable(backlinks));

program
  .command('query')
  .alias('q')
  .description(`Run Datalog query and args ${PIPEABLE}`)
  .arguments("<query> [args...]")
  .option('--limit <type:integer>', 'Limit to N entries (omit for no limit)', {default: Infinity})
  .option('-f, --format <type:string>', 'Output format (md|json)', {default: 'md'})
  .option('--json', 'Output JSON format')
  .action(pipeable(query));

// External command stubs for help visibility
program
  .command('list')
  .alias('l')
  .arguments("[item...]")
  .description('List items');

program
  .command('day')
  .alias('d')
  .arguments("[offset]", {default: 0})
  .description(`Find date from offset ${PIPEABLE}`)
  .example(`Show today's journal page`, `nt day | nt page`)
  .example(`Show today's journal page name including dow`, `nt day | nt name`)
  .example(`Show yesterday's journal page (negatives are not options)`, `nt day -- -1 | nt page`)
  .example(`Show yesterday's journal page (piping avoids that dance)`, `-1 | nt day | nt page`)
  .example(`Show tomorrows's journal page`, `nt day 1 | nt page`)
  .example(`Show yesterday's, today's, and tomorrow's journal page in pwsh`, `-1, 0, 1 | nt day | nt page`)
  .example(`Review 90 days of journal entries in zsh`, `seq 0 -90 | nt day | nt page`)
  .example(`Review 90 days of journal entries in pwsh`, `0..-90 | nt day | nt page`)
  .example(`Review tasks from the past month`, `seq 0 -30 | nt day | nt page --only tasks`)

program
  .command('skills')
  .description('List skills and their descriptions');

program
  .command('about')
  .alias('a')
  .arguments(demand("name..."))
  .description('Retrieves information about a topic including prequisites');

program
  .command('prop')
  .description('Rewrite page properties')
  .option('-a, --add <value>', 'Property to add (format: key=value)', { collect: true })
  .option('-r, --remove <value>', 'Property to remove (format: key=value)', { collect: true })
  .arguments(PIPED)
  .action(async (options) => {
    try {
      await prop(options);
    } catch (error) {
      abort(error);
    }
  });

program
  .command('parse')
  .description('Convert flat markdown to structured blocks')
  .arguments(PIPED)
  .action(parse);

program
  .command('stringify')
  .alias('str')
  .description('Convert structured blocks back to markdown')
  .option('-f, --format <type:string>', 'Output format (md|json) (default: "md")', {default: 'md'})
  .option('--json', 'Output JSON format')
  .option('-l, --less [patterns:string]', 'Less content matching regex patterns', { collect: true })
  .option('-o, --only [patterns:string]', 'Only content matching regex patterns', { collect: true })
  .arguments(PIPED)
  .action(async (options) => {
    const { keep, fixed } = LogseqPage.selects(options, config);
    const input = await new Response(Deno.stdin.readable).text();

    if (!input.trim()) {
      console.error("Error: No input provided via stdin");
      Deno.exit(1);
    }

    try {
      const blocks = JSON.parse(input);
      const page = LogseqPage.stringify(blocks, keep, fixed);
      console.log(page);
    } catch (error) {
      console.error("Error parsing JSON input:", error);
      Deno.exit(1);
    }
  });

program
  .command('seen')
  .description('Filters to seen lines')
  .arguments(PIPED);

program
  .command('exists')
  .description('Filters paths for existing files')
  .arguments(PIPED);

program
  .command('links')
  .description('Extracts links from content')
  .option('-t, --type <type:string>', 'Type of link (md|bare|all)', {default: 'all'})
  .option('--bare', 'Include only bare portion of markdown links')
  .arguments(PIPED)
  .example("List links on a page", `nt page GenAI | nt links`);

program
  .command('wikilinks')
  .description('Extracts wikilinks from content')
  .option('-t, --type <type:string>', 'Type of link (bracket|tag|all)', {default: 'bracket'})
  .arguments(PIPED)
  .example("List wikilinks on a page", `nt page Boardgames | nt wikilinks`);

program
  .command('wikify')
  .description('Convert markdown headers to wiki format')
  .arguments(PIPED);

program
  .command(
    "config",
    new Command()
      .description("Show configuration")
      .action(function(){
        this.showHelp();
      })
      .command("file", new Command()
        .description("Show the path to the config file")
        .action(function(){
          console.log(NOTE_CONFIG);
        }))
      .command("repo", new Command()
        .description("Show the path to the Logseq repo")
        .action(function(){
          console.log(config.logseq.repo);
        }))
      .command("filter", new Command()
        .description("Lists defined filters for use with --less and --only `page` options")
        .action(function(){
          Object.entries(config.filter ?? {})
            .forEach(([key, value]) => console.log(key, " => ", value));
        }))
      .command("query", new Command()
        .description("Lists defined queries")
        .action(function(){
          Object.entries(config.query ?? {})
            .forEach(([key, value]) => console.log(key, " => ", value));
        })));

if (import.meta.main) {
  if (Deno.args.length === 0) {
    program.showHelp();
    abort();
  } else {
    const replacing = {
      "--swap" : "--heading=0",
      "--json" : "--format=json",
      "--md" : "--format=md",
      "--agent" : "--less",
      "--human" : "--only"
    }
    await program.parse(Deno.args.map(arg => replacing[arg] ?? arg));
  }
}
