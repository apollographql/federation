var composition = (function (node_fetch_1) {
	'use strict';

	function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

	var node_fetch_1__default = /*#__PURE__*/_interopDefaultLegacy(node_fetch_1);

	var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function getDefaultExportFromCjs (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
	}

	function getAugmentedNamespace(n) {
		if (n.__esModule) return n;
		var a = Object.defineProperty({}, '__esModule', {value: true});
		Object.keys(n).forEach(function (k) {
			var d = Object.getOwnPropertyDescriptor(n, k);
			Object.defineProperty(a, k, d.get ? d : {
				enumerable: true,
				get: function () {
					return n[k];
				}
			});
		});
		return a;
	}

	function createCommonjsModule(fn) {
	  var module = { exports: {} };
		return fn(module, module.exports), module.exports;
	}

	var check = function (it) {
	  return it && it.Math == Math && it;
	};

	// https://github.com/zloirock/core-js/issues/86#issuecomment-115759028
	var global$1 =
	  // eslint-disable-next-line no-undef
	  check(typeof globalThis == 'object' && globalThis) ||
	  check(typeof window == 'object' && window) ||
	  check(typeof self == 'object' && self) ||
	  check(typeof commonjsGlobal == 'object' && commonjsGlobal) ||
	  // eslint-disable-next-line no-new-func
	  Function('return this')();

	var fails = function (exec) {
	  try {
	    return !!exec();
	  } catch (error) {
	    return true;
	  }
	};

	// Thank's IE8 for his funny defineProperty
	var descriptors = !fails(function () {
	  return Object.defineProperty({}, 1, { get: function () { return 7; } })[1] != 7;
	});

	var nativePropertyIsEnumerable = {}.propertyIsEnumerable;
	var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

	// Nashorn ~ JDK8 bug
	var NASHORN_BUG = getOwnPropertyDescriptor && !nativePropertyIsEnumerable.call({ 1: 2 }, 1);

	// `Object.prototype.propertyIsEnumerable` method implementation
	// https://tc39.github.io/ecma262/#sec-object.prototype.propertyisenumerable
	var f = NASHORN_BUG ? function propertyIsEnumerable(V) {
	  var descriptor = getOwnPropertyDescriptor(this, V);
	  return !!descriptor && descriptor.enumerable;
	} : nativePropertyIsEnumerable;

	var objectPropertyIsEnumerable = {
		f: f
	};

	var createPropertyDescriptor = function (bitmap, value) {
	  return {
	    enumerable: !(bitmap & 1),
	    configurable: !(bitmap & 2),
	    writable: !(bitmap & 4),
	    value: value
	  };
	};

	var toString = {}.toString;

	var classofRaw = function (it) {
	  return toString.call(it).slice(8, -1);
	};

	var split = ''.split;

	// fallback for non-array-like ES3 and non-enumerable old V8 strings
	var indexedObject = fails(function () {
	  // throws an error in rhino, see https://github.com/mozilla/rhino/issues/346
	  // eslint-disable-next-line no-prototype-builtins
	  return !Object('z').propertyIsEnumerable(0);
	}) ? function (it) {
	  return classofRaw(it) == 'String' ? split.call(it, '') : Object(it);
	} : Object;

	// `RequireObjectCoercible` abstract operation
	// https://tc39.github.io/ecma262/#sec-requireobjectcoercible
	var requireObjectCoercible = function (it) {
	  if (it == undefined) throw TypeError("Can't call method on " + it);
	  return it;
	};

	// toObject with fallback for non-array-like ES3 strings



	var toIndexedObject = function (it) {
	  return indexedObject(requireObjectCoercible(it));
	};

	var isObject = function (it) {
	  return typeof it === 'object' ? it !== null : typeof it === 'function';
	};

	// `ToPrimitive` abstract operation
	// https://tc39.github.io/ecma262/#sec-toprimitive
	// instead of the ES6 spec version, we didn't implement @@toPrimitive case
	// and the second argument - flag - preferred type is a string
	var toPrimitive = function (input, PREFERRED_STRING) {
	  if (!isObject(input)) return input;
	  var fn, val;
	  if (PREFERRED_STRING && typeof (fn = input.toString) == 'function' && !isObject(val = fn.call(input))) return val;
	  if (typeof (fn = input.valueOf) == 'function' && !isObject(val = fn.call(input))) return val;
	  if (!PREFERRED_STRING && typeof (fn = input.toString) == 'function' && !isObject(val = fn.call(input))) return val;
	  throw TypeError("Can't convert object to primitive value");
	};

	var hasOwnProperty = {}.hasOwnProperty;

	var has = function (it, key) {
	  return hasOwnProperty.call(it, key);
	};

	var document$1 = global$1.document;
	// typeof document.createElement is 'object' in old IE
	var EXISTS = isObject(document$1) && isObject(document$1.createElement);

	var documentCreateElement = function (it) {
	  return EXISTS ? document$1.createElement(it) : {};
	};

	// Thank's IE8 for his funny defineProperty
	var ie8DomDefine = !descriptors && !fails(function () {
	  return Object.defineProperty(documentCreateElement('div'), 'a', {
	    get: function () { return 7; }
	  }).a != 7;
	});

	var nativeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

	// `Object.getOwnPropertyDescriptor` method
	// https://tc39.github.io/ecma262/#sec-object.getownpropertydescriptor
	var f$1 = descriptors ? nativeGetOwnPropertyDescriptor : function getOwnPropertyDescriptor(O, P) {
	  O = toIndexedObject(O);
	  P = toPrimitive(P, true);
	  if (ie8DomDefine) try {
	    return nativeGetOwnPropertyDescriptor(O, P);
	  } catch (error) { /* empty */ }
	  if (has(O, P)) return createPropertyDescriptor(!objectPropertyIsEnumerable.f.call(O, P), O[P]);
	};

	var objectGetOwnPropertyDescriptor = {
		f: f$1
	};

	var anObject = function (it) {
	  if (!isObject(it)) {
	    throw TypeError(String(it) + ' is not an object');
	  } return it;
	};

	var nativeDefineProperty = Object.defineProperty;

	// `Object.defineProperty` method
	// https://tc39.github.io/ecma262/#sec-object.defineproperty
	var f$2 = descriptors ? nativeDefineProperty : function defineProperty(O, P, Attributes) {
	  anObject(O);
	  P = toPrimitive(P, true);
	  anObject(Attributes);
	  if (ie8DomDefine) try {
	    return nativeDefineProperty(O, P, Attributes);
	  } catch (error) { /* empty */ }
	  if ('get' in Attributes || 'set' in Attributes) throw TypeError('Accessors not supported');
	  if ('value' in Attributes) O[P] = Attributes.value;
	  return O;
	};

	var objectDefineProperty = {
		f: f$2
	};

	var createNonEnumerableProperty = descriptors ? function (object, key, value) {
	  return objectDefineProperty.f(object, key, createPropertyDescriptor(1, value));
	} : function (object, key, value) {
	  object[key] = value;
	  return object;
	};

	var setGlobal = function (key, value) {
	  try {
	    createNonEnumerableProperty(global$1, key, value);
	  } catch (error) {
	    global$1[key] = value;
	  } return value;
	};

	var SHARED = '__core-js_shared__';
	var store = global$1[SHARED] || setGlobal(SHARED, {});

	var sharedStore = store;

	var functionToString = Function.toString;

	// this helper broken in `3.4.1-3.4.4`, so we can't use `shared` helper
	if (typeof sharedStore.inspectSource != 'function') {
	  sharedStore.inspectSource = function (it) {
	    return functionToString.call(it);
	  };
	}

	var inspectSource = sharedStore.inspectSource;

	var WeakMap$1 = global$1.WeakMap;

	var nativeWeakMap = typeof WeakMap$1 === 'function' && /native code/.test(inspectSource(WeakMap$1));

	var shared = createCommonjsModule(function (module) {
	(module.exports = function (key, value) {
	  return sharedStore[key] || (sharedStore[key] = value !== undefined ? value : {});
	})('versions', []).push({
	  version: '3.6.5',
	  mode:  'global',
	  copyright: '© 2020 Denis Pushkarev (zloirock.ru)'
	});
	});

	var id = 0;
	var postfix = Math.random();

	var uid = function (key) {
	  return 'Symbol(' + String(key === undefined ? '' : key) + ')_' + (++id + postfix).toString(36);
	};

	var keys = shared('keys');

	var sharedKey = function (key) {
	  return keys[key] || (keys[key] = uid(key));
	};

	var hiddenKeys = {};

	var WeakMap$2 = global$1.WeakMap;
	var set, get, has$1;

	var enforce = function (it) {
	  return has$1(it) ? get(it) : set(it, {});
	};

	var getterFor = function (TYPE) {
	  return function (it) {
	    var state;
	    if (!isObject(it) || (state = get(it)).type !== TYPE) {
	      throw TypeError('Incompatible receiver, ' + TYPE + ' required');
	    } return state;
	  };
	};

	if (nativeWeakMap) {
	  var store$1 = new WeakMap$2();
	  var wmget = store$1.get;
	  var wmhas = store$1.has;
	  var wmset = store$1.set;
	  set = function (it, metadata) {
	    wmset.call(store$1, it, metadata);
	    return metadata;
	  };
	  get = function (it) {
	    return wmget.call(store$1, it) || {};
	  };
	  has$1 = function (it) {
	    return wmhas.call(store$1, it);
	  };
	} else {
	  var STATE = sharedKey('state');
	  hiddenKeys[STATE] = true;
	  set = function (it, metadata) {
	    createNonEnumerableProperty(it, STATE, metadata);
	    return metadata;
	  };
	  get = function (it) {
	    return has(it, STATE) ? it[STATE] : {};
	  };
	  has$1 = function (it) {
	    return has(it, STATE);
	  };
	}

	var internalState = {
	  set: set,
	  get: get,
	  has: has$1,
	  enforce: enforce,
	  getterFor: getterFor
	};

	var redefine = createCommonjsModule(function (module) {
	var getInternalState = internalState.get;
	var enforceInternalState = internalState.enforce;
	var TEMPLATE = String(String).split('String');

	(module.exports = function (O, key, value, options) {
	  var unsafe = options ? !!options.unsafe : false;
	  var simple = options ? !!options.enumerable : false;
	  var noTargetGet = options ? !!options.noTargetGet : false;
	  if (typeof value == 'function') {
	    if (typeof key == 'string' && !has(value, 'name')) createNonEnumerableProperty(value, 'name', key);
	    enforceInternalState(value).source = TEMPLATE.join(typeof key == 'string' ? key : '');
	  }
	  if (O === global$1) {
	    if (simple) O[key] = value;
	    else setGlobal(key, value);
	    return;
	  } else if (!unsafe) {
	    delete O[key];
	  } else if (!noTargetGet && O[key]) {
	    simple = true;
	  }
	  if (simple) O[key] = value;
	  else createNonEnumerableProperty(O, key, value);
	// add fake Function#toString for correct work wrapped methods / constructors with methods like LoDash isNative
	})(Function.prototype, 'toString', function toString() {
	  return typeof this == 'function' && getInternalState(this).source || inspectSource(this);
	});
	});

	var path = global$1;

	var aFunction = function (variable) {
	  return typeof variable == 'function' ? variable : undefined;
	};

	var getBuiltIn = function (namespace, method) {
	  return arguments.length < 2 ? aFunction(path[namespace]) || aFunction(global$1[namespace])
	    : path[namespace] && path[namespace][method] || global$1[namespace] && global$1[namespace][method];
	};

	var ceil = Math.ceil;
	var floor = Math.floor;

	// `ToInteger` abstract operation
	// https://tc39.github.io/ecma262/#sec-tointeger
	var toInteger = function (argument) {
	  return isNaN(argument = +argument) ? 0 : (argument > 0 ? floor : ceil)(argument);
	};

	var min = Math.min;

	// `ToLength` abstract operation
	// https://tc39.github.io/ecma262/#sec-tolength
	var toLength = function (argument) {
	  return argument > 0 ? min(toInteger(argument), 0x1FFFFFFFFFFFFF) : 0; // 2 ** 53 - 1 == 9007199254740991
	};

	var max = Math.max;
	var min$1 = Math.min;

	// Helper for a popular repeating case of the spec:
	// Let integer be ? ToInteger(index).
	// If integer < 0, let result be max((length + integer), 0); else let result be min(integer, length).
	var toAbsoluteIndex = function (index, length) {
	  var integer = toInteger(index);
	  return integer < 0 ? max(integer + length, 0) : min$1(integer, length);
	};

	// `Array.prototype.{ indexOf, includes }` methods implementation
	var createMethod = function (IS_INCLUDES) {
	  return function ($this, el, fromIndex) {
	    var O = toIndexedObject($this);
	    var length = toLength(O.length);
	    var index = toAbsoluteIndex(fromIndex, length);
	    var value;
	    // Array#includes uses SameValueZero equality algorithm
	    // eslint-disable-next-line no-self-compare
	    if (IS_INCLUDES && el != el) while (length > index) {
	      value = O[index++];
	      // eslint-disable-next-line no-self-compare
	      if (value != value) return true;
	    // Array#indexOf ignores holes, Array#includes - not
	    } else for (;length > index; index++) {
	      if ((IS_INCLUDES || index in O) && O[index] === el) return IS_INCLUDES || index || 0;
	    } return !IS_INCLUDES && -1;
	  };
	};

	var arrayIncludes = {
	  // `Array.prototype.includes` method
	  // https://tc39.github.io/ecma262/#sec-array.prototype.includes
	  includes: createMethod(true),
	  // `Array.prototype.indexOf` method
	  // https://tc39.github.io/ecma262/#sec-array.prototype.indexof
	  indexOf: createMethod(false)
	};

	var indexOf = arrayIncludes.indexOf;


	var objectKeysInternal = function (object, names) {
	  var O = toIndexedObject(object);
	  var i = 0;
	  var result = [];
	  var key;
	  for (key in O) !has(hiddenKeys, key) && has(O, key) && result.push(key);
	  // Don't enum bug & hidden keys
	  while (names.length > i) if (has(O, key = names[i++])) {
	    ~indexOf(result, key) || result.push(key);
	  }
	  return result;
	};

	// IE8- don't enum bug keys
	var enumBugKeys = [
	  'constructor',
	  'hasOwnProperty',
	  'isPrototypeOf',
	  'propertyIsEnumerable',
	  'toLocaleString',
	  'toString',
	  'valueOf'
	];

	var hiddenKeys$1 = enumBugKeys.concat('length', 'prototype');

	// `Object.getOwnPropertyNames` method
	// https://tc39.github.io/ecma262/#sec-object.getownpropertynames
	var f$3 = Object.getOwnPropertyNames || function getOwnPropertyNames(O) {
	  return objectKeysInternal(O, hiddenKeys$1);
	};

	var objectGetOwnPropertyNames = {
		f: f$3
	};

	var f$4 = Object.getOwnPropertySymbols;

	var objectGetOwnPropertySymbols = {
		f: f$4
	};

	// all object keys, includes non-enumerable and symbols
	var ownKeys = getBuiltIn('Reflect', 'ownKeys') || function ownKeys(it) {
	  var keys = objectGetOwnPropertyNames.f(anObject(it));
	  var getOwnPropertySymbols = objectGetOwnPropertySymbols.f;
	  return getOwnPropertySymbols ? keys.concat(getOwnPropertySymbols(it)) : keys;
	};

	var copyConstructorProperties = function (target, source) {
	  var keys = ownKeys(source);
	  var defineProperty = objectDefineProperty.f;
	  var getOwnPropertyDescriptor = objectGetOwnPropertyDescriptor.f;
	  for (var i = 0; i < keys.length; i++) {
	    var key = keys[i];
	    if (!has(target, key)) defineProperty(target, key, getOwnPropertyDescriptor(source, key));
	  }
	};

	var replacement = /#|\.prototype\./;

	var isForced = function (feature, detection) {
	  var value = data[normalize(feature)];
	  return value == POLYFILL ? true
	    : value == NATIVE ? false
	    : typeof detection == 'function' ? fails(detection)
	    : !!detection;
	};

	var normalize = isForced.normalize = function (string) {
	  return String(string).replace(replacement, '.').toLowerCase();
	};

	var data = isForced.data = {};
	var NATIVE = isForced.NATIVE = 'N';
	var POLYFILL = isForced.POLYFILL = 'P';

	var isForced_1 = isForced;

	var getOwnPropertyDescriptor$1 = objectGetOwnPropertyDescriptor.f;






	/*
	  options.target      - name of the target object
	  options.global      - target is the global object
	  options.stat        - export as static methods of target
	  options.proto       - export as prototype methods of target
	  options.real        - real prototype method for the `pure` version
	  options.forced      - export even if the native feature is available
	  options.bind        - bind methods to the target, required for the `pure` version
	  options.wrap        - wrap constructors to preventing global pollution, required for the `pure` version
	  options.unsafe      - use the simple assignment of property instead of delete + defineProperty
	  options.sham        - add a flag to not completely full polyfills
	  options.enumerable  - export as enumerable property
	  options.noTargetGet - prevent calling a getter on target
	*/
	var _export = function (options, source) {
	  var TARGET = options.target;
	  var GLOBAL = options.global;
	  var STATIC = options.stat;
	  var FORCED, target, key, targetProperty, sourceProperty, descriptor;
	  if (GLOBAL) {
	    target = global$1;
	  } else if (STATIC) {
	    target = global$1[TARGET] || setGlobal(TARGET, {});
	  } else {
	    target = (global$1[TARGET] || {}).prototype;
	  }
	  if (target) for (key in source) {
	    sourceProperty = source[key];
	    if (options.noTargetGet) {
	      descriptor = getOwnPropertyDescriptor$1(target, key);
	      targetProperty = descriptor && descriptor.value;
	    } else targetProperty = target[key];
	    FORCED = isForced_1(GLOBAL ? key : TARGET + (STATIC ? '.' : '#') + key, options.forced);
	    // contained in target
	    if (!FORCED && targetProperty !== undefined) {
	      if (typeof sourceProperty === typeof targetProperty) continue;
	      copyConstructorProperties(sourceProperty, targetProperty);
	    }
	    // add a flag to not completely full polyfills
	    if (options.sham || (targetProperty && targetProperty.sham)) {
	      createNonEnumerableProperty(sourceProperty, 'sham', true);
	    }
	    // extend global
	    redefine(target, key, sourceProperty, options);
	  }
	};

	// `IsArray` abstract operation
	// https://tc39.github.io/ecma262/#sec-isarray
	var isArray = Array.isArray || function isArray(arg) {
	  return classofRaw(arg) == 'Array';
	};

	var aFunction$1 = function (it) {
	  if (typeof it != 'function') {
	    throw TypeError(String(it) + ' is not a function');
	  } return it;
	};

	// optional / simple context binding
	var functionBindContext = function (fn, that, length) {
	  aFunction$1(fn);
	  if (that === undefined) return fn;
	  switch (length) {
	    case 0: return function () {
	      return fn.call(that);
	    };
	    case 1: return function (a) {
	      return fn.call(that, a);
	    };
	    case 2: return function (a, b) {
	      return fn.call(that, a, b);
	    };
	    case 3: return function (a, b, c) {
	      return fn.call(that, a, b, c);
	    };
	  }
	  return function (/* ...args */) {
	    return fn.apply(that, arguments);
	  };
	};

	// `FlattenIntoArray` abstract operation
	// https://tc39.github.io/proposal-flatMap/#sec-FlattenIntoArray
	var flattenIntoArray = function (target, original, source, sourceLen, start, depth, mapper, thisArg) {
	  var targetIndex = start;
	  var sourceIndex = 0;
	  var mapFn = mapper ? functionBindContext(mapper, thisArg, 3) : false;
	  var element;

	  while (sourceIndex < sourceLen) {
	    if (sourceIndex in source) {
	      element = mapFn ? mapFn(source[sourceIndex], sourceIndex, original) : source[sourceIndex];

	      if (depth > 0 && isArray(element)) {
	        targetIndex = flattenIntoArray(target, original, element, toLength(element.length), targetIndex, depth - 1) - 1;
	      } else {
	        if (targetIndex >= 0x1FFFFFFFFFFFFF) throw TypeError('Exceed the acceptable array length');
	        target[targetIndex] = element;
	      }

	      targetIndex++;
	    }
	    sourceIndex++;
	  }
	  return targetIndex;
	};

	var flattenIntoArray_1 = flattenIntoArray;

	// `ToObject` abstract operation
	// https://tc39.github.io/ecma262/#sec-toobject
	var toObject = function (argument) {
	  return Object(requireObjectCoercible(argument));
	};

	var nativeSymbol = !!Object.getOwnPropertySymbols && !fails(function () {
	  // Chrome 38 Symbol has incorrect toString conversion
	  // eslint-disable-next-line no-undef
	  return !String(Symbol());
	});

	var useSymbolAsUid = nativeSymbol
	  // eslint-disable-next-line no-undef
	  && !Symbol.sham
	  // eslint-disable-next-line no-undef
	  && typeof Symbol.iterator == 'symbol';

	var WellKnownSymbolsStore = shared('wks');
	var Symbol$1 = global$1.Symbol;
	var createWellKnownSymbol = useSymbolAsUid ? Symbol$1 : Symbol$1 && Symbol$1.withoutSetter || uid;

	var wellKnownSymbol = function (name) {
	  if (!has(WellKnownSymbolsStore, name)) {
	    if (nativeSymbol && has(Symbol$1, name)) WellKnownSymbolsStore[name] = Symbol$1[name];
	    else WellKnownSymbolsStore[name] = createWellKnownSymbol('Symbol.' + name);
	  } return WellKnownSymbolsStore[name];
	};

	var SPECIES = wellKnownSymbol('species');

	// `ArraySpeciesCreate` abstract operation
	// https://tc39.github.io/ecma262/#sec-arrayspeciescreate
	var arraySpeciesCreate = function (originalArray, length) {
	  var C;
	  if (isArray(originalArray)) {
	    C = originalArray.constructor;
	    // cross-realm fallback
	    if (typeof C == 'function' && (C === Array || isArray(C.prototype))) C = undefined;
	    else if (isObject(C)) {
	      C = C[SPECIES];
	      if (C === null) C = undefined;
	    }
	  } return new (C === undefined ? Array : C)(length === 0 ? 0 : length);
	};

	// `Array.prototype.flat` method
	// https://github.com/tc39/proposal-flatMap
	_export({ target: 'Array', proto: true }, {
	  flat: function flat(/* depthArg = 1 */) {
	    var depthArg = arguments.length ? arguments[0] : undefined;
	    var O = toObject(this);
	    var sourceLen = toLength(O.length);
	    var A = arraySpeciesCreate(O, 0);
	    A.length = flattenIntoArray_1(A, O, O, sourceLen, 0, depthArg === undefined ? 1 : toInteger(depthArg));
	    return A;
	  }
	});

	// `Object.keys` method
	// https://tc39.github.io/ecma262/#sec-object.keys
	var objectKeys = Object.keys || function keys(O) {
	  return objectKeysInternal(O, enumBugKeys);
	};

	// `Object.defineProperties` method
	// https://tc39.github.io/ecma262/#sec-object.defineproperties
	var objectDefineProperties = descriptors ? Object.defineProperties : function defineProperties(O, Properties) {
	  anObject(O);
	  var keys = objectKeys(Properties);
	  var length = keys.length;
	  var index = 0;
	  var key;
	  while (length > index) objectDefineProperty.f(O, key = keys[index++], Properties[key]);
	  return O;
	};

	var html = getBuiltIn('document', 'documentElement');

	var GT = '>';
	var LT = '<';
	var PROTOTYPE = 'prototype';
	var SCRIPT = 'script';
	var IE_PROTO = sharedKey('IE_PROTO');

	var EmptyConstructor = function () { /* empty */ };

	var scriptTag = function (content) {
	  return LT + SCRIPT + GT + content + LT + '/' + SCRIPT + GT;
	};

	// Create object with fake `null` prototype: use ActiveX Object with cleared prototype
	var NullProtoObjectViaActiveX = function (activeXDocument) {
	  activeXDocument.write(scriptTag(''));
	  activeXDocument.close();
	  var temp = activeXDocument.parentWindow.Object;
	  activeXDocument = null; // avoid memory leak
	  return temp;
	};

	// Create object with fake `null` prototype: use iframe Object with cleared prototype
	var NullProtoObjectViaIFrame = function () {
	  // Thrash, waste and sodomy: IE GC bug
	  var iframe = documentCreateElement('iframe');
	  var JS = 'java' + SCRIPT + ':';
	  var iframeDocument;
	  iframe.style.display = 'none';
	  html.appendChild(iframe);
	  // https://github.com/zloirock/core-js/issues/475
	  iframe.src = String(JS);
	  iframeDocument = iframe.contentWindow.document;
	  iframeDocument.open();
	  iframeDocument.write(scriptTag('document.F=Object'));
	  iframeDocument.close();
	  return iframeDocument.F;
	};

	// Check for document.domain and active x support
	// No need to use active x approach when document.domain is not set
	// see https://github.com/es-shims/es5-shim/issues/150
	// variation of https://github.com/kitcambridge/es5-shim/commit/4f738ac066346
	// avoid IE GC bug
	var activeXDocument;
	var NullProtoObject = function () {
	  try {
	    /* global ActiveXObject */
	    activeXDocument = document.domain && new ActiveXObject('htmlfile');
	  } catch (error) { /* ignore */ }
	  NullProtoObject = activeXDocument ? NullProtoObjectViaActiveX(activeXDocument) : NullProtoObjectViaIFrame();
	  var length = enumBugKeys.length;
	  while (length--) delete NullProtoObject[PROTOTYPE][enumBugKeys[length]];
	  return NullProtoObject();
	};

	hiddenKeys[IE_PROTO] = true;

	// `Object.create` method
	// https://tc39.github.io/ecma262/#sec-object.create
	var objectCreate = Object.create || function create(O, Properties) {
	  var result;
	  if (O !== null) {
	    EmptyConstructor[PROTOTYPE] = anObject(O);
	    result = new EmptyConstructor();
	    EmptyConstructor[PROTOTYPE] = null;
	    // add "__proto__" for Object.getPrototypeOf polyfill
	    result[IE_PROTO] = O;
	  } else result = NullProtoObject();
	  return Properties === undefined ? result : objectDefineProperties(result, Properties);
	};

	var UNSCOPABLES = wellKnownSymbol('unscopables');
	var ArrayPrototype = Array.prototype;

	// Array.prototype[@@unscopables]
	// https://tc39.github.io/ecma262/#sec-array.prototype-@@unscopables
	if (ArrayPrototype[UNSCOPABLES] == undefined) {
	  objectDefineProperty.f(ArrayPrototype, UNSCOPABLES, {
	    configurable: true,
	    value: objectCreate(null)
	  });
	}

	// add a key to Array.prototype[@@unscopables]
	var addToUnscopables = function (key) {
	  ArrayPrototype[UNSCOPABLES][key] = true;
	};

	// this method was added to unscopables after implementation
	// in popular engines, so it's moved to a separate module


	addToUnscopables('flat');

	var call = Function.call;

	var entryUnbind = function (CONSTRUCTOR, METHOD, length) {
	  return functionBindContext(call, global$1[CONSTRUCTOR].prototype[METHOD], length);
	};

	var flat = entryUnbind('Array', 'flat');

	// `Array.prototype.flatMap` method
	// https://github.com/tc39/proposal-flatMap
	_export({ target: 'Array', proto: true }, {
	  flatMap: function flatMap(callbackfn /* , thisArg */) {
	    var O = toObject(this);
	    var sourceLen = toLength(O.length);
	    var A;
	    aFunction$1(callbackfn);
	    A = arraySpeciesCreate(O, 0);
	    A.length = flattenIntoArray_1(A, O, O, sourceLen, 0, 1, callbackfn, arguments.length > 1 ? arguments[1] : undefined);
	    return A;
	  }
	});

	// this method was added to unscopables after implementation
	// in popular engines, so it's moved to a separate module


	addToUnscopables('flatMap');

	var flatMap = entryUnbind('Array', 'flatMap');

	/**
	 * Note: This file is autogenerated using "resources/gen-version.js" script and
	 * automatically updated by "yarn version" command.
	 */

	/**
	 * A string containing the version of the GraphQL.js library
	 */
	var version = '14.7.0';
	/**
	 * An object containing the components of the GraphQL.js version string
	 */

	var versionInfo = Object.freeze({
	  major: 14,
	  minor: 7,
	  patch: 0,
	  preReleaseTag: null
	});

	/**
	 * Returns true if the value acts like a Promise, i.e. has a "then" function,
	 * otherwise returns false.
	 */
	// eslint-disable-next-line no-redeclare
	function isPromise(value) {
	  return Boolean(value && typeof value.then === 'function');
	}

	var nodejsCustomInspectSymbol = typeof Symbol === 'function' && typeof Symbol.for === 'function' ? Symbol.for('nodejs.util.inspect.custom') : undefined;

	function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }
	var MAX_ARRAY_LENGTH = 10;
	var MAX_RECURSIVE_DEPTH = 2;
	/**
	 * Used to print values in error messages.
	 */

	function inspect(value) {
	  return formatValue(value, []);
	}

	function formatValue(value, seenValues) {
	  switch (_typeof(value)) {
	    case 'string':
	      return JSON.stringify(value);

	    case 'function':
	      return value.name ? "[function ".concat(value.name, "]") : '[function]';

	    case 'object':
	      if (value === null) {
	        return 'null';
	      }

	      return formatObjectValue(value, seenValues);

	    default:
	      return String(value);
	  }
	}

	function formatObjectValue(value, previouslySeenValues) {
	  if (previouslySeenValues.indexOf(value) !== -1) {
	    return '[Circular]';
	  }

	  var seenValues = [].concat(previouslySeenValues, [value]);
	  var customInspectFn = getCustomFn(value);

	  if (customInspectFn !== undefined) {
	    // $FlowFixMe(>=0.90.0)
	    var customValue = customInspectFn.call(value); // check for infinite recursion

	    if (customValue !== value) {
	      return typeof customValue === 'string' ? customValue : formatValue(customValue, seenValues);
	    }
	  } else if (Array.isArray(value)) {
	    return formatArray(value, seenValues);
	  }

	  return formatObject(value, seenValues);
	}

	function formatObject(object, seenValues) {
	  var keys = Object.keys(object);

	  if (keys.length === 0) {
	    return '{}';
	  }

	  if (seenValues.length > MAX_RECURSIVE_DEPTH) {
	    return '[' + getObjectTag(object) + ']';
	  }

	  var properties = keys.map(function (key) {
	    var value = formatValue(object[key], seenValues);
	    return key + ': ' + value;
	  });
	  return '{ ' + properties.join(', ') + ' }';
	}

	function formatArray(array, seenValues) {
	  if (array.length === 0) {
	    return '[]';
	  }

	  if (seenValues.length > MAX_RECURSIVE_DEPTH) {
	    return '[Array]';
	  }

	  var len = Math.min(MAX_ARRAY_LENGTH, array.length);
	  var remaining = array.length - len;
	  var items = [];

	  for (var i = 0; i < len; ++i) {
	    items.push(formatValue(array[i], seenValues));
	  }

	  if (remaining === 1) {
	    items.push('... 1 more item');
	  } else if (remaining > 1) {
	    items.push("... ".concat(remaining, " more items"));
	  }

	  return '[' + items.join(', ') + ']';
	}

	function getCustomFn(object) {
	  var customInspectFn = object[String(nodejsCustomInspectSymbol)];

	  if (typeof customInspectFn === 'function') {
	    return customInspectFn;
	  }

	  if (typeof object.inspect === 'function') {
	    return object.inspect;
	  }
	}

	function getObjectTag(object) {
	  var tag = Object.prototype.toString.call(object).replace(/^\[object /, '').replace(/]$/, '');

	  if (tag === 'Object' && typeof object.constructor === 'function') {
	    var name = object.constructor.name;

	    if (typeof name === 'string' && name !== '') {
	      return name;
	    }
	  }

	  return tag;
	}

	function devAssert(condition, message) {
	  var booleanCondition = Boolean(condition);

	  if (!booleanCondition) {
	    throw new Error(message);
	  }
	}

	/**
	 * The `defineToJSON()` function defines toJSON() and inspect() prototype
	 * methods, if no function provided they become aliases for toString().
	 */

	function defineToJSON(classObject) {
	  var fn = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : classObject.prototype.toString;
	  classObject.prototype.toJSON = fn;
	  classObject.prototype.inspect = fn;

	  if (nodejsCustomInspectSymbol) {
	    classObject.prototype[nodejsCustomInspectSymbol] = fn;
	  }
	}

	function _typeof$1(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof$1 = function _typeof(obj) { return typeof obj; }; } else { _typeof$1 = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof$1(obj); }

	/**
	 * Return true if `value` is object-like. A value is object-like if it's not
	 * `null` and has a `typeof` result of "object".
	 */
	function isObjectLike(value) {
	  return _typeof$1(value) == 'object' && value !== null;
	}

	/**
	 * Represents a location in a Source.
	 */

	/**
	 * Takes a Source and a UTF-8 character offset, and returns the corresponding
	 * line and column as a SourceLocation.
	 */
	function getLocation(source, position) {
	  var lineRegexp = /\r\n|[\n\r]/g;
	  var line = 1;
	  var column = position + 1;
	  var match;

	  while ((match = lineRegexp.exec(source.body)) && match.index < position) {
	    line += 1;
	    column = position + 1 - (match.index + match[0].length);
	  }

	  return {
	    line: line,
	    column: column
	  };
	}

	/**
	 * Render a helpful description of the location in the GraphQL Source document.
	 */

	function printLocation(location) {
	  return printSourceLocation(location.source, getLocation(location.source, location.start));
	}
	/**
	 * Render a helpful description of the location in the GraphQL Source document.
	 */

	function printSourceLocation(source, sourceLocation) {
	  var firstLineColumnOffset = source.locationOffset.column - 1;
	  var body = whitespace(firstLineColumnOffset) + source.body;
	  var lineIndex = sourceLocation.line - 1;
	  var lineOffset = source.locationOffset.line - 1;
	  var lineNum = sourceLocation.line + lineOffset;
	  var columnOffset = sourceLocation.line === 1 ? firstLineColumnOffset : 0;
	  var columnNum = sourceLocation.column + columnOffset;
	  var locationStr = "".concat(source.name, ":").concat(lineNum, ":").concat(columnNum, "\n");
	  var lines = body.split(/\r\n|[\n\r]/g);
	  var locationLine = lines[lineIndex]; // Special case for minified documents

	  if (locationLine.length > 120) {
	    var sublineIndex = Math.floor(columnNum / 80);
	    var sublineColumnNum = columnNum % 80;
	    var sublines = [];

	    for (var i = 0; i < locationLine.length; i += 80) {
	      sublines.push(locationLine.slice(i, i + 80));
	    }

	    return locationStr + printPrefixedLines([["".concat(lineNum), sublines[0]]].concat(sublines.slice(1, sublineIndex + 1).map(function (subline) {
	      return ['', subline];
	    }), [[' ', whitespace(sublineColumnNum - 1) + '^'], ['', sublines[sublineIndex + 1]]]));
	  }

	  return locationStr + printPrefixedLines([// Lines specified like this: ["prefix", "string"],
	  ["".concat(lineNum - 1), lines[lineIndex - 1]], ["".concat(lineNum), locationLine], ['', whitespace(columnNum - 1) + '^'], ["".concat(lineNum + 1), lines[lineIndex + 1]]]);
	}

	function printPrefixedLines(lines) {
	  var existingLines = lines.filter(function (_ref) {
	    var _ = _ref[0],
	        line = _ref[1];
	    return line !== undefined;
	  });
	  var padLen = Math.max.apply(Math, existingLines.map(function (_ref2) {
	    var prefix = _ref2[0];
	    return prefix.length;
	  }));
	  return existingLines.map(function (_ref3) {
	    var prefix = _ref3[0],
	        line = _ref3[1];
	    return lpad(padLen, prefix) + (line ? ' | ' + line : ' |');
	  }).join('\n');
	}

	function whitespace(len) {
	  return Array(len + 1).join(' ');
	}

	function lpad(len, str) {
	  return whitespace(len - str.length) + str;
	}

	/**
	 * A GraphQLError describes an Error found during the parse, validate, or
	 * execute phases of performing a GraphQL operation. In addition to a message
	 * and stack trace, it also includes information about the locations in a
	 * GraphQL document and/or execution result that correspond to the Error.
	 */

	function GraphQLError( // eslint-disable-line no-redeclare
	message, nodes, source, positions, path, originalError, extensions) {
	  // Compute list of blame nodes.
	  var _nodes = Array.isArray(nodes) ? nodes.length !== 0 ? nodes : undefined : nodes ? [nodes] : undefined; // Compute locations in the source for the given nodes/positions.


	  var _source = source;

	  if (!_source && _nodes) {
	    var node = _nodes[0];
	    _source = node && node.loc && node.loc.source;
	  }

	  var _positions = positions;

	  if (!_positions && _nodes) {
	    _positions = _nodes.reduce(function (list, node) {
	      if (node.loc) {
	        list.push(node.loc.start);
	      }

	      return list;
	    }, []);
	  }

	  if (_positions && _positions.length === 0) {
	    _positions = undefined;
	  }

	  var _locations;

	  if (positions && source) {
	    _locations = positions.map(function (pos) {
	      return getLocation(source, pos);
	    });
	  } else if (_nodes) {
	    _locations = _nodes.reduce(function (list, node) {
	      if (node.loc) {
	        list.push(getLocation(node.loc.source, node.loc.start));
	      }

	      return list;
	    }, []);
	  }

	  var _extensions = extensions;

	  if (_extensions == null && originalError != null) {
	    var originalExtensions = originalError.extensions;

	    if (isObjectLike(originalExtensions)) {
	      _extensions = originalExtensions;
	    }
	  }

	  Object.defineProperties(this, {
	    message: {
	      value: message,
	      // By being enumerable, JSON.stringify will include `message` in the
	      // resulting output. This ensures that the simplest possible GraphQL
	      // service adheres to the spec.
	      enumerable: true,
	      writable: true
	    },
	    locations: {
	      // Coercing falsey values to undefined ensures they will not be included
	      // in JSON.stringify() when not provided.
	      value: _locations || undefined,
	      // By being enumerable, JSON.stringify will include `locations` in the
	      // resulting output. This ensures that the simplest possible GraphQL
	      // service adheres to the spec.
	      enumerable: Boolean(_locations)
	    },
	    path: {
	      // Coercing falsey values to undefined ensures they will not be included
	      // in JSON.stringify() when not provided.
	      value: path || undefined,
	      // By being enumerable, JSON.stringify will include `path` in the
	      // resulting output. This ensures that the simplest possible GraphQL
	      // service adheres to the spec.
	      enumerable: Boolean(path)
	    },
	    nodes: {
	      value: _nodes || undefined
	    },
	    source: {
	      value: _source || undefined
	    },
	    positions: {
	      value: _positions || undefined
	    },
	    originalError: {
	      value: originalError
	    },
	    extensions: {
	      // Coercing falsey values to undefined ensures they will not be included
	      // in JSON.stringify() when not provided.
	      value: _extensions || undefined,
	      // By being enumerable, JSON.stringify will include `path` in the
	      // resulting output. This ensures that the simplest possible GraphQL
	      // service adheres to the spec.
	      enumerable: Boolean(_extensions)
	    }
	  }); // Include (non-enumerable) stack trace.

	  if (originalError && originalError.stack) {
	    Object.defineProperty(this, 'stack', {
	      value: originalError.stack,
	      writable: true,
	      configurable: true
	    });
	  } else if (Error.captureStackTrace) {
	    Error.captureStackTrace(this, GraphQLError);
	  } else {
	    Object.defineProperty(this, 'stack', {
	      value: Error().stack,
	      writable: true,
	      configurable: true
	    });
	  }
	}
	GraphQLError.prototype = Object.create(Error.prototype, {
	  constructor: {
	    value: GraphQLError
	  },
	  name: {
	    value: 'GraphQLError'
	  },
	  toString: {
	    value: function toString() {
	      return printError(this);
	    }
	  }
	});
	/**
	 * Prints a GraphQLError to a string, representing useful location information
	 * about the error's position in the source.
	 */

	function printError(error) {
	  var output = error.message;

	  if (error.nodes) {
	    for (var _i2 = 0, _error$nodes2 = error.nodes; _i2 < _error$nodes2.length; _i2++) {
	      var node = _error$nodes2[_i2];

	      if (node.loc) {
	        output += '\n\n' + printLocation(node.loc);
	      }
	    }
	  } else if (error.source && error.locations) {
	    for (var _i4 = 0, _error$locations2 = error.locations; _i4 < _error$locations2.length; _i4++) {
	      var location = _error$locations2[_i4];
	      output += '\n\n' + printSourceLocation(error.source, location);
	    }
	  }

	  return output;
	}

	/**
	 * Produces a GraphQLError representing a syntax error, containing useful
	 * descriptive information about the syntax error's position in the source.
	 */

	function syntaxError(source, position, description) {
	  return new GraphQLError("Syntax Error: ".concat(description), undefined, source, [position]);
	}

	/**
	 * The set of allowed kind values for AST nodes.
	 */
	var Kind = Object.freeze({
	  // Name
	  NAME: 'Name',
	  // Document
	  DOCUMENT: 'Document',
	  OPERATION_DEFINITION: 'OperationDefinition',
	  VARIABLE_DEFINITION: 'VariableDefinition',
	  SELECTION_SET: 'SelectionSet',
	  FIELD: 'Field',
	  ARGUMENT: 'Argument',
	  // Fragments
	  FRAGMENT_SPREAD: 'FragmentSpread',
	  INLINE_FRAGMENT: 'InlineFragment',
	  FRAGMENT_DEFINITION: 'FragmentDefinition',
	  // Values
	  VARIABLE: 'Variable',
	  INT: 'IntValue',
	  FLOAT: 'FloatValue',
	  STRING: 'StringValue',
	  BOOLEAN: 'BooleanValue',
	  NULL: 'NullValue',
	  ENUM: 'EnumValue',
	  LIST: 'ListValue',
	  OBJECT: 'ObjectValue',
	  OBJECT_FIELD: 'ObjectField',
	  // Directives
	  DIRECTIVE: 'Directive',
	  // Types
	  NAMED_TYPE: 'NamedType',
	  LIST_TYPE: 'ListType',
	  NON_NULL_TYPE: 'NonNullType',
	  // Type System Definitions
	  SCHEMA_DEFINITION: 'SchemaDefinition',
	  OPERATION_TYPE_DEFINITION: 'OperationTypeDefinition',
	  // Type Definitions
	  SCALAR_TYPE_DEFINITION: 'ScalarTypeDefinition',
	  OBJECT_TYPE_DEFINITION: 'ObjectTypeDefinition',
	  FIELD_DEFINITION: 'FieldDefinition',
	  INPUT_VALUE_DEFINITION: 'InputValueDefinition',
	  INTERFACE_TYPE_DEFINITION: 'InterfaceTypeDefinition',
	  UNION_TYPE_DEFINITION: 'UnionTypeDefinition',
	  ENUM_TYPE_DEFINITION: 'EnumTypeDefinition',
	  ENUM_VALUE_DEFINITION: 'EnumValueDefinition',
	  INPUT_OBJECT_TYPE_DEFINITION: 'InputObjectTypeDefinition',
	  // Directive Definitions
	  DIRECTIVE_DEFINITION: 'DirectiveDefinition',
	  // Type System Extensions
	  SCHEMA_EXTENSION: 'SchemaExtension',
	  // Type Extensions
	  SCALAR_TYPE_EXTENSION: 'ScalarTypeExtension',
	  OBJECT_TYPE_EXTENSION: 'ObjectTypeExtension',
	  INTERFACE_TYPE_EXTENSION: 'InterfaceTypeExtension',
	  UNION_TYPE_EXTENSION: 'UnionTypeExtension',
	  ENUM_TYPE_EXTENSION: 'EnumTypeExtension',
	  INPUT_OBJECT_TYPE_EXTENSION: 'InputObjectTypeExtension'
	});
	/**
	 * The enum type representing the possible kind values of AST nodes.
	 */

	/**
	 * The `defineToStringTag()` function checks first to see if the runtime
	 * supports the `Symbol` class and then if the `Symbol.toStringTag` constant
	 * is defined as a `Symbol` instance. If both conditions are met, the
	 * Symbol.toStringTag property is defined as a getter that returns the
	 * supplied class constructor's name.
	 *
	 * @method defineToStringTag
	 *
	 * @param {Class<any>} classObject a class such as Object, String, Number but
	 * typically one of your own creation through the class keyword; `class A {}`,
	 * for example.
	 */
	function defineToStringTag(classObject) {
	  if (typeof Symbol === 'function' && Symbol.toStringTag) {
	    Object.defineProperty(classObject.prototype, Symbol.toStringTag, {
	      get: function get() {
	        return this.constructor.name;
	      }
	    });
	  }
	}

	/**
	 * A representation of source input to GraphQL.
	 * `name` and `locationOffset` are optional. They are useful for clients who
	 * store GraphQL documents in source files; for example, if the GraphQL input
	 * starts at line 40 in a file named Foo.graphql, it might be useful for name to
	 * be "Foo.graphql" and location to be `{ line: 40, column: 0 }`.
	 * line and column in locationOffset are 1-indexed
	 */
	var Source = function Source(body, name, locationOffset) {
	  this.body = body;
	  this.name = name || 'GraphQL request';
	  this.locationOffset = locationOffset || {
	    line: 1,
	    column: 1
	  };
	  this.locationOffset.line > 0 || devAssert(0, 'line in locationOffset is 1-indexed and must be positive');
	  this.locationOffset.column > 0 || devAssert(0, 'column in locationOffset is 1-indexed and must be positive');
	}; // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(Source);

	/**
	 * Produces the value of a block string from its parsed raw value, similar to
	 * CoffeeScript's block string, Python's docstring trim or Ruby's strip_heredoc.
	 *
	 * This implements the GraphQL spec's BlockStringValue() static algorithm.
	 */
	function dedentBlockStringValue(rawString) {
	  // Expand a block string's raw value into independent lines.
	  var lines = rawString.split(/\r\n|[\n\r]/g); // Remove common indentation from all lines but first.

	  var commonIndent = getBlockStringIndentation(lines);

	  if (commonIndent !== 0) {
	    for (var i = 1; i < lines.length; i++) {
	      lines[i] = lines[i].slice(commonIndent);
	    }
	  } // Remove leading and trailing blank lines.


	  while (lines.length > 0 && isBlank(lines[0])) {
	    lines.shift();
	  }

	  while (lines.length > 0 && isBlank(lines[lines.length - 1])) {
	    lines.pop();
	  } // Return a string of the lines joined with U+000A.


	  return lines.join('\n');
	} // @internal

	function getBlockStringIndentation(lines) {
	  var commonIndent = null;

	  for (var i = 1; i < lines.length; i++) {
	    var line = lines[i];
	    var indent = leadingWhitespace(line);

	    if (indent === line.length) {
	      continue; // skip empty lines
	    }

	    if (commonIndent === null || indent < commonIndent) {
	      commonIndent = indent;

	      if (commonIndent === 0) {
	        break;
	      }
	    }
	  }

	  return commonIndent === null ? 0 : commonIndent;
	}

	function leadingWhitespace(str) {
	  var i = 0;

	  while (i < str.length && (str[i] === ' ' || str[i] === '\t')) {
	    i++;
	  }

	  return i;
	}

	function isBlank(str) {
	  return leadingWhitespace(str) === str.length;
	}
	/**
	 * Print a block string in the indented block form by adding a leading and
	 * trailing blank line. However, if a block string starts with whitespace and is
	 * a single-line, adding a leading blank line would strip that whitespace.
	 */


	function printBlockString(value) {
	  var indentation = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
	  var preferMultipleLines = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
	  var isSingleLine = value.indexOf('\n') === -1;
	  var hasLeadingSpace = value[0] === ' ' || value[0] === '\t';
	  var hasTrailingQuote = value[value.length - 1] === '"';
	  var printAsMultipleLines = !isSingleLine || hasTrailingQuote || preferMultipleLines;
	  var result = ''; // Format a multi-line block quote to account for leading space.

	  if (printAsMultipleLines && !(isSingleLine && hasLeadingSpace)) {
	    result += '\n' + indentation;
	  }

	  result += indentation ? value.replace(/\n/g, '\n' + indentation) : value;

	  if (printAsMultipleLines) {
	    result += '\n';
	  }

	  return '"""' + result.replace(/"""/g, '\\"""') + '"""';
	}

	/**
	 * An exported enum describing the different kinds of tokens that the
	 * lexer emits.
	 */
	var TokenKind = Object.freeze({
	  SOF: '<SOF>',
	  EOF: '<EOF>',
	  BANG: '!',
	  DOLLAR: '$',
	  AMP: '&',
	  PAREN_L: '(',
	  PAREN_R: ')',
	  SPREAD: '...',
	  COLON: ':',
	  EQUALS: '=',
	  AT: '@',
	  BRACKET_L: '[',
	  BRACKET_R: ']',
	  BRACE_L: '{',
	  PIPE: '|',
	  BRACE_R: '}',
	  NAME: 'Name',
	  INT: 'Int',
	  FLOAT: 'Float',
	  STRING: 'String',
	  BLOCK_STRING: 'BlockString',
	  COMMENT: 'Comment'
	});
	/**
	 * The enum type representing the token kinds values.
	 */

	/**
	 * Given a Source object, this returns a Lexer for that source.
	 * A Lexer is a stateful stream generator in that every time
	 * it is advanced, it returns the next token in the Source. Assuming the
	 * source lexes, the final Token emitted by the lexer will be of kind
	 * EOF, after which the lexer will repeatedly return the same EOF token
	 * whenever called.
	 */

	function createLexer(source, options) {
	  var startOfFileToken = new Tok(TokenKind.SOF, 0, 0, 0, 0, null);
	  var lexer = {
	    source: source,
	    options: options,
	    lastToken: startOfFileToken,
	    token: startOfFileToken,
	    line: 1,
	    lineStart: 0,
	    advance: advanceLexer,
	    lookahead: lookahead
	  };
	  return lexer;
	}

	function advanceLexer() {
	  this.lastToken = this.token;
	  var token = this.token = this.lookahead();
	  return token;
	}

	function lookahead() {
	  var token = this.token;

	  if (token.kind !== TokenKind.EOF) {
	    do {
	      // Note: next is only mutable during parsing, so we cast to allow this.
	      token = token.next || (token.next = readToken(this, token));
	    } while (token.kind === TokenKind.COMMENT);
	  }

	  return token;
	}
	/**
	 * The return type of createLexer.
	 */


	// @internal
	function isPunctuatorToken(token) {
	  var kind = token.kind;
	  return kind === TokenKind.BANG || kind === TokenKind.DOLLAR || kind === TokenKind.AMP || kind === TokenKind.PAREN_L || kind === TokenKind.PAREN_R || kind === TokenKind.SPREAD || kind === TokenKind.COLON || kind === TokenKind.EQUALS || kind === TokenKind.AT || kind === TokenKind.BRACKET_L || kind === TokenKind.BRACKET_R || kind === TokenKind.BRACE_L || kind === TokenKind.PIPE || kind === TokenKind.BRACE_R;
	}
	/**
	 * Helper function for constructing the Token object.
	 */

	function Tok(kind, start, end, line, column, prev, value) {
	  this.kind = kind;
	  this.start = start;
	  this.end = end;
	  this.line = line;
	  this.column = column;
	  this.value = value;
	  this.prev = prev;
	  this.next = null;
	} // Print a simplified form when appearing in JSON/util.inspect.


	defineToJSON(Tok, function () {
	  return {
	    kind: this.kind,
	    value: this.value,
	    line: this.line,
	    column: this.column
	  };
	});

	function printCharCode(code) {
	  return (// NaN/undefined represents access beyond the end of the file.
	    isNaN(code) ? TokenKind.EOF : // Trust JSON for ASCII.
	    code < 0x007f ? JSON.stringify(String.fromCharCode(code)) : // Otherwise print the escaped form.
	    "\"\\u".concat(('00' + code.toString(16).toUpperCase()).slice(-4), "\"")
	  );
	}
	/**
	 * Gets the next token from the source starting at the given position.
	 *
	 * This skips over whitespace until it finds the next lexable token, then lexes
	 * punctuators immediately or calls the appropriate helper function for more
	 * complicated tokens.
	 */


	function readToken(lexer, prev) {
	  var source = lexer.source;
	  var body = source.body;
	  var bodyLength = body.length;
	  var pos = positionAfterWhitespace(body, prev.end, lexer);
	  var line = lexer.line;
	  var col = 1 + pos - lexer.lineStart;

	  if (pos >= bodyLength) {
	    return new Tok(TokenKind.EOF, bodyLength, bodyLength, line, col, prev);
	  }

	  var code = body.charCodeAt(pos); // SourceCharacter

	  switch (code) {
	    // !
	    case 33:
	      return new Tok(TokenKind.BANG, pos, pos + 1, line, col, prev);
	    // #

	    case 35:
	      return readComment(source, pos, line, col, prev);
	    // $

	    case 36:
	      return new Tok(TokenKind.DOLLAR, pos, pos + 1, line, col, prev);
	    // &

	    case 38:
	      return new Tok(TokenKind.AMP, pos, pos + 1, line, col, prev);
	    // (

	    case 40:
	      return new Tok(TokenKind.PAREN_L, pos, pos + 1, line, col, prev);
	    // )

	    case 41:
	      return new Tok(TokenKind.PAREN_R, pos, pos + 1, line, col, prev);
	    // .

	    case 46:
	      if (body.charCodeAt(pos + 1) === 46 && body.charCodeAt(pos + 2) === 46) {
	        return new Tok(TokenKind.SPREAD, pos, pos + 3, line, col, prev);
	      }

	      break;
	    // :

	    case 58:
	      return new Tok(TokenKind.COLON, pos, pos + 1, line, col, prev);
	    // =

	    case 61:
	      return new Tok(TokenKind.EQUALS, pos, pos + 1, line, col, prev);
	    // @

	    case 64:
	      return new Tok(TokenKind.AT, pos, pos + 1, line, col, prev);
	    // [

	    case 91:
	      return new Tok(TokenKind.BRACKET_L, pos, pos + 1, line, col, prev);
	    // ]

	    case 93:
	      return new Tok(TokenKind.BRACKET_R, pos, pos + 1, line, col, prev);
	    // {

	    case 123:
	      return new Tok(TokenKind.BRACE_L, pos, pos + 1, line, col, prev);
	    // |

	    case 124:
	      return new Tok(TokenKind.PIPE, pos, pos + 1, line, col, prev);
	    // }

	    case 125:
	      return new Tok(TokenKind.BRACE_R, pos, pos + 1, line, col, prev);
	    // A-Z _ a-z

	    case 65:
	    case 66:
	    case 67:
	    case 68:
	    case 69:
	    case 70:
	    case 71:
	    case 72:
	    case 73:
	    case 74:
	    case 75:
	    case 76:
	    case 77:
	    case 78:
	    case 79:
	    case 80:
	    case 81:
	    case 82:
	    case 83:
	    case 84:
	    case 85:
	    case 86:
	    case 87:
	    case 88:
	    case 89:
	    case 90:
	    case 95:
	    case 97:
	    case 98:
	    case 99:
	    case 100:
	    case 101:
	    case 102:
	    case 103:
	    case 104:
	    case 105:
	    case 106:
	    case 107:
	    case 108:
	    case 109:
	    case 110:
	    case 111:
	    case 112:
	    case 113:
	    case 114:
	    case 115:
	    case 116:
	    case 117:
	    case 118:
	    case 119:
	    case 120:
	    case 121:
	    case 122:
	      return readName(source, pos, line, col, prev);
	    // - 0-9

	    case 45:
	    case 48:
	    case 49:
	    case 50:
	    case 51:
	    case 52:
	    case 53:
	    case 54:
	    case 55:
	    case 56:
	    case 57:
	      return readNumber(source, pos, code, line, col, prev);
	    // "

	    case 34:
	      if (body.charCodeAt(pos + 1) === 34 && body.charCodeAt(pos + 2) === 34) {
	        return readBlockString(source, pos, line, col, prev, lexer);
	      }

	      return readString(source, pos, line, col, prev);
	  }

	  throw syntaxError(source, pos, unexpectedCharacterMessage(code));
	}
	/**
	 * Report a message that an unexpected character was encountered.
	 */


	function unexpectedCharacterMessage(code) {
	  if (code < 0x0020 && code !== 0x0009 && code !== 0x000a && code !== 0x000d) {
	    return "Cannot contain the invalid character ".concat(printCharCode(code), ".");
	  }

	  if (code === 39) {
	    // '
	    return 'Unexpected single quote character (\'), did you mean to use a double quote (")?';
	  }

	  return "Cannot parse the unexpected character ".concat(printCharCode(code), ".");
	}
	/**
	 * Reads from body starting at startPosition until it finds a non-whitespace
	 * character, then returns the position of that character for lexing.
	 */


	function positionAfterWhitespace(body, startPosition, lexer) {
	  var bodyLength = body.length;
	  var position = startPosition;

	  while (position < bodyLength) {
	    var code = body.charCodeAt(position); // tab | space | comma | BOM

	    if (code === 9 || code === 32 || code === 44 || code === 0xfeff) {
	      ++position;
	    } else if (code === 10) {
	      // new line
	      ++position;
	      ++lexer.line;
	      lexer.lineStart = position;
	    } else if (code === 13) {
	      // carriage return
	      if (body.charCodeAt(position + 1) === 10) {
	        position += 2;
	      } else {
	        ++position;
	      }

	      ++lexer.line;
	      lexer.lineStart = position;
	    } else {
	      break;
	    }
	  }

	  return position;
	}
	/**
	 * Reads a comment token from the source file.
	 *
	 * #[\u0009\u0020-\uFFFF]*
	 */


	function readComment(source, start, line, col, prev) {
	  var body = source.body;
	  var code;
	  var position = start;

	  do {
	    code = body.charCodeAt(++position);
	  } while (!isNaN(code) && ( // SourceCharacter but not LineTerminator
	  code > 0x001f || code === 0x0009));

	  return new Tok(TokenKind.COMMENT, start, position, line, col, prev, body.slice(start + 1, position));
	}
	/**
	 * Reads a number token from the source file, either a float
	 * or an int depending on whether a decimal point appears.
	 *
	 * Int:   -?(0|[1-9][0-9]*)
	 * Float: -?(0|[1-9][0-9]*)(\.[0-9]+)?((E|e)(+|-)?[0-9]+)?
	 */


	function readNumber(source, start, firstCode, line, col, prev) {
	  var body = source.body;
	  var code = firstCode;
	  var position = start;
	  var isFloat = false;

	  if (code === 45) {
	    // -
	    code = body.charCodeAt(++position);
	  }

	  if (code === 48) {
	    // 0
	    code = body.charCodeAt(++position);

	    if (code >= 48 && code <= 57) {
	      throw syntaxError(source, position, "Invalid number, unexpected digit after 0: ".concat(printCharCode(code), "."));
	    }
	  } else {
	    position = readDigits(source, position, code);
	    code = body.charCodeAt(position);
	  }

	  if (code === 46) {
	    // .
	    isFloat = true;
	    code = body.charCodeAt(++position);
	    position = readDigits(source, position, code);
	    code = body.charCodeAt(position);
	  }

	  if (code === 69 || code === 101) {
	    // E e
	    isFloat = true;
	    code = body.charCodeAt(++position);

	    if (code === 43 || code === 45) {
	      // + -
	      code = body.charCodeAt(++position);
	    }

	    position = readDigits(source, position, code);
	    code = body.charCodeAt(position);
	  } // Numbers cannot be followed by . or e


	  if (code === 46 || code === 69 || code === 101) {
	    throw syntaxError(source, position, "Invalid number, expected digit but got: ".concat(printCharCode(code), "."));
	  }

	  return new Tok(isFloat ? TokenKind.FLOAT : TokenKind.INT, start, position, line, col, prev, body.slice(start, position));
	}
	/**
	 * Returns the new position in the source after reading digits.
	 */


	function readDigits(source, start, firstCode) {
	  var body = source.body;
	  var position = start;
	  var code = firstCode;

	  if (code >= 48 && code <= 57) {
	    // 0 - 9
	    do {
	      code = body.charCodeAt(++position);
	    } while (code >= 48 && code <= 57); // 0 - 9


	    return position;
	  }

	  throw syntaxError(source, position, "Invalid number, expected digit but got: ".concat(printCharCode(code), "."));
	}
	/**
	 * Reads a string token from the source file.
	 *
	 * "([^"\\\u000A\u000D]|(\\(u[0-9a-fA-F]{4}|["\\/bfnrt])))*"
	 */


	function readString(source, start, line, col, prev) {
	  var body = source.body;
	  var position = start + 1;
	  var chunkStart = position;
	  var code = 0;
	  var value = '';

	  while (position < body.length && !isNaN(code = body.charCodeAt(position)) && // not LineTerminator
	  code !== 0x000a && code !== 0x000d) {
	    // Closing Quote (")
	    if (code === 34) {
	      value += body.slice(chunkStart, position);
	      return new Tok(TokenKind.STRING, start, position + 1, line, col, prev, value);
	    } // SourceCharacter


	    if (code < 0x0020 && code !== 0x0009) {
	      throw syntaxError(source, position, "Invalid character within String: ".concat(printCharCode(code), "."));
	    }

	    ++position;

	    if (code === 92) {
	      // \
	      value += body.slice(chunkStart, position - 1);
	      code = body.charCodeAt(position);

	      switch (code) {
	        case 34:
	          value += '"';
	          break;

	        case 47:
	          value += '/';
	          break;

	        case 92:
	          value += '\\';
	          break;

	        case 98:
	          value += '\b';
	          break;

	        case 102:
	          value += '\f';
	          break;

	        case 110:
	          value += '\n';
	          break;

	        case 114:
	          value += '\r';
	          break;

	        case 116:
	          value += '\t';
	          break;

	        case 117:
	          {
	            // uXXXX
	            var charCode = uniCharCode(body.charCodeAt(position + 1), body.charCodeAt(position + 2), body.charCodeAt(position + 3), body.charCodeAt(position + 4));

	            if (charCode < 0) {
	              var invalidSequence = body.slice(position + 1, position + 5);
	              throw syntaxError(source, position, "Invalid character escape sequence: \\u".concat(invalidSequence, "."));
	            }

	            value += String.fromCharCode(charCode);
	            position += 4;
	            break;
	          }

	        default:
	          throw syntaxError(source, position, "Invalid character escape sequence: \\".concat(String.fromCharCode(code), "."));
	      }

	      ++position;
	      chunkStart = position;
	    }
	  }

	  throw syntaxError(source, position, 'Unterminated string.');
	}
	/**
	 * Reads a block string token from the source file.
	 *
	 * """("?"?(\\"""|\\(?!=""")|[^"\\]))*"""
	 */


	function readBlockString(source, start, line, col, prev, lexer) {
	  var body = source.body;
	  var position = start + 3;
	  var chunkStart = position;
	  var code = 0;
	  var rawValue = '';

	  while (position < body.length && !isNaN(code = body.charCodeAt(position))) {
	    // Closing Triple-Quote (""")
	    if (code === 34 && body.charCodeAt(position + 1) === 34 && body.charCodeAt(position + 2) === 34) {
	      rawValue += body.slice(chunkStart, position);
	      return new Tok(TokenKind.BLOCK_STRING, start, position + 3, line, col, prev, dedentBlockStringValue(rawValue));
	    } // SourceCharacter


	    if (code < 0x0020 && code !== 0x0009 && code !== 0x000a && code !== 0x000d) {
	      throw syntaxError(source, position, "Invalid character within String: ".concat(printCharCode(code), "."));
	    }

	    if (code === 10) {
	      // new line
	      ++position;
	      ++lexer.line;
	      lexer.lineStart = position;
	    } else if (code === 13) {
	      // carriage return
	      if (body.charCodeAt(position + 1) === 10) {
	        position += 2;
	      } else {
	        ++position;
	      }

	      ++lexer.line;
	      lexer.lineStart = position;
	    } else if ( // Escape Triple-Quote (\""")
	    code === 92 && body.charCodeAt(position + 1) === 34 && body.charCodeAt(position + 2) === 34 && body.charCodeAt(position + 3) === 34) {
	      rawValue += body.slice(chunkStart, position) + '"""';
	      position += 4;
	      chunkStart = position;
	    } else {
	      ++position;
	    }
	  }

	  throw syntaxError(source, position, 'Unterminated string.');
	}
	/**
	 * Converts four hexadecimal chars to the integer that the
	 * string represents. For example, uniCharCode('0','0','0','f')
	 * will return 15, and uniCharCode('0','0','f','f') returns 255.
	 *
	 * Returns a negative number on error, if a char was invalid.
	 *
	 * This is implemented by noting that char2hex() returns -1 on error,
	 * which means the result of ORing the char2hex() will also be negative.
	 */


	function uniCharCode(a, b, c, d) {
	  return char2hex(a) << 12 | char2hex(b) << 8 | char2hex(c) << 4 | char2hex(d);
	}
	/**
	 * Converts a hex character to its integer value.
	 * '0' becomes 0, '9' becomes 9
	 * 'A' becomes 10, 'F' becomes 15
	 * 'a' becomes 10, 'f' becomes 15
	 *
	 * Returns -1 on error.
	 */


	function char2hex(a) {
	  return a >= 48 && a <= 57 ? a - 48 // 0-9
	  : a >= 65 && a <= 70 ? a - 55 // A-F
	  : a >= 97 && a <= 102 ? a - 87 // a-f
	  : -1;
	}
	/**
	 * Reads an alphanumeric + underscore name from the source.
	 *
	 * [_A-Za-z][_0-9A-Za-z]*
	 */


	function readName(source, start, line, col, prev) {
	  var body = source.body;
	  var bodyLength = body.length;
	  var position = start + 1;
	  var code = 0;

	  while (position !== bodyLength && !isNaN(code = body.charCodeAt(position)) && (code === 95 || // _
	  code >= 48 && code <= 57 || // 0-9
	  code >= 65 && code <= 90 || // A-Z
	  code >= 97 && code <= 122) // a-z
	  ) {
	    ++position;
	  }

	  return new Tok(TokenKind.NAME, start, position, line, col, prev, body.slice(start, position));
	}

	/**
	 * The set of allowed directive location values.
	 */
	var DirectiveLocation = Object.freeze({
	  // Request Definitions
	  QUERY: 'QUERY',
	  MUTATION: 'MUTATION',
	  SUBSCRIPTION: 'SUBSCRIPTION',
	  FIELD: 'FIELD',
	  FRAGMENT_DEFINITION: 'FRAGMENT_DEFINITION',
	  FRAGMENT_SPREAD: 'FRAGMENT_SPREAD',
	  INLINE_FRAGMENT: 'INLINE_FRAGMENT',
	  VARIABLE_DEFINITION: 'VARIABLE_DEFINITION',
	  // Type System Definitions
	  SCHEMA: 'SCHEMA',
	  SCALAR: 'SCALAR',
	  OBJECT: 'OBJECT',
	  FIELD_DEFINITION: 'FIELD_DEFINITION',
	  ARGUMENT_DEFINITION: 'ARGUMENT_DEFINITION',
	  INTERFACE: 'INTERFACE',
	  UNION: 'UNION',
	  ENUM: 'ENUM',
	  ENUM_VALUE: 'ENUM_VALUE',
	  INPUT_OBJECT: 'INPUT_OBJECT',
	  INPUT_FIELD_DEFINITION: 'INPUT_FIELD_DEFINITION'
	});
	/**
	 * The enum type representing the directive location values.
	 */

	/**
	 * Given a GraphQL source, parses it into a Document.
	 * Throws GraphQLError if a syntax error is encountered.
	 */
	function parse(source, options) {
	  var parser = new Parser(source, options);
	  return parser.parseDocument();
	}
	/**
	 * Given a string containing a GraphQL value (ex. `[42]`), parse the AST for
	 * that value.
	 * Throws GraphQLError if a syntax error is encountered.
	 *
	 * This is useful within tools that operate upon GraphQL Values directly and
	 * in isolation of complete GraphQL documents.
	 *
	 * Consider providing the results to the utility function: valueFromAST().
	 */

	function parseValue(source, options) {
	  var parser = new Parser(source, options);
	  parser.expectToken(TokenKind.SOF);
	  var value = parser.parseValueLiteral(false);
	  parser.expectToken(TokenKind.EOF);
	  return value;
	}
	/**
	 * Given a string containing a GraphQL Type (ex. `[Int!]`), parse the AST for
	 * that type.
	 * Throws GraphQLError if a syntax error is encountered.
	 *
	 * This is useful within tools that operate upon GraphQL Types directly and
	 * in isolation of complete GraphQL documents.
	 *
	 * Consider providing the results to the utility function: typeFromAST().
	 */

	function parseType(source, options) {
	  var parser = new Parser(source, options);
	  parser.expectToken(TokenKind.SOF);
	  var type = parser.parseTypeReference();
	  parser.expectToken(TokenKind.EOF);
	  return type;
	}

	var Parser =
	/*#__PURE__*/
	function () {
	  function Parser(source, options) {
	    var sourceObj = typeof source === 'string' ? new Source(source) : source;
	    sourceObj instanceof Source || devAssert(0, "Must provide Source. Received: ".concat(inspect(sourceObj)));
	    this._lexer = createLexer(sourceObj);
	    this._options = options || {};
	  }
	  /**
	   * Converts a name lex token into a name parse node.
	   */


	  var _proto = Parser.prototype;

	  _proto.parseName = function parseName() {
	    var token = this.expectToken(TokenKind.NAME);
	    return {
	      kind: Kind.NAME,
	      value: token.value,
	      loc: this.loc(token)
	    };
	  } // Implements the parsing rules in the Document section.

	  /**
	   * Document : Definition+
	   */
	  ;

	  _proto.parseDocument = function parseDocument() {
	    var start = this._lexer.token;
	    return {
	      kind: Kind.DOCUMENT,
	      definitions: this.many(TokenKind.SOF, this.parseDefinition, TokenKind.EOF),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * Definition :
	   *   - ExecutableDefinition
	   *   - TypeSystemDefinition
	   *   - TypeSystemExtension
	   *
	   * ExecutableDefinition :
	   *   - OperationDefinition
	   *   - FragmentDefinition
	   */
	  ;

	  _proto.parseDefinition = function parseDefinition() {
	    if (this.peek(TokenKind.NAME)) {
	      switch (this._lexer.token.value) {
	        case 'query':
	        case 'mutation':
	        case 'subscription':
	          return this.parseOperationDefinition();

	        case 'fragment':
	          return this.parseFragmentDefinition();

	        case 'schema':
	        case 'scalar':
	        case 'type':
	        case 'interface':
	        case 'union':
	        case 'enum':
	        case 'input':
	        case 'directive':
	          return this.parseTypeSystemDefinition();

	        case 'extend':
	          return this.parseTypeSystemExtension();
	      }
	    } else if (this.peek(TokenKind.BRACE_L)) {
	      return this.parseOperationDefinition();
	    } else if (this.peekDescription()) {
	      return this.parseTypeSystemDefinition();
	    }

	    throw this.unexpected();
	  } // Implements the parsing rules in the Operations section.

	  /**
	   * OperationDefinition :
	   *  - SelectionSet
	   *  - OperationType Name? VariableDefinitions? Directives? SelectionSet
	   */
	  ;

	  _proto.parseOperationDefinition = function parseOperationDefinition() {
	    var start = this._lexer.token;

	    if (this.peek(TokenKind.BRACE_L)) {
	      return {
	        kind: Kind.OPERATION_DEFINITION,
	        operation: 'query',
	        name: undefined,
	        variableDefinitions: [],
	        directives: [],
	        selectionSet: this.parseSelectionSet(),
	        loc: this.loc(start)
	      };
	    }

	    var operation = this.parseOperationType();
	    var name;

	    if (this.peek(TokenKind.NAME)) {
	      name = this.parseName();
	    }

	    return {
	      kind: Kind.OPERATION_DEFINITION,
	      operation: operation,
	      name: name,
	      variableDefinitions: this.parseVariableDefinitions(),
	      directives: this.parseDirectives(false),
	      selectionSet: this.parseSelectionSet(),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * OperationType : one of query mutation subscription
	   */
	  ;

	  _proto.parseOperationType = function parseOperationType() {
	    var operationToken = this.expectToken(TokenKind.NAME);

	    switch (operationToken.value) {
	      case 'query':
	        return 'query';

	      case 'mutation':
	        return 'mutation';

	      case 'subscription':
	        return 'subscription';
	    }

	    throw this.unexpected(operationToken);
	  }
	  /**
	   * VariableDefinitions : ( VariableDefinition+ )
	   */
	  ;

	  _proto.parseVariableDefinitions = function parseVariableDefinitions() {
	    return this.optionalMany(TokenKind.PAREN_L, this.parseVariableDefinition, TokenKind.PAREN_R);
	  }
	  /**
	   * VariableDefinition : Variable : Type DefaultValue? Directives[Const]?
	   */
	  ;

	  _proto.parseVariableDefinition = function parseVariableDefinition() {
	    var start = this._lexer.token;
	    return {
	      kind: Kind.VARIABLE_DEFINITION,
	      variable: this.parseVariable(),
	      type: (this.expectToken(TokenKind.COLON), this.parseTypeReference()),
	      defaultValue: this.expectOptionalToken(TokenKind.EQUALS) ? this.parseValueLiteral(true) : undefined,
	      directives: this.parseDirectives(true),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * Variable : $ Name
	   */
	  ;

	  _proto.parseVariable = function parseVariable() {
	    var start = this._lexer.token;
	    this.expectToken(TokenKind.DOLLAR);
	    return {
	      kind: Kind.VARIABLE,
	      name: this.parseName(),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * SelectionSet : { Selection+ }
	   */
	  ;

	  _proto.parseSelectionSet = function parseSelectionSet() {
	    var start = this._lexer.token;
	    return {
	      kind: Kind.SELECTION_SET,
	      selections: this.many(TokenKind.BRACE_L, this.parseSelection, TokenKind.BRACE_R),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * Selection :
	   *   - Field
	   *   - FragmentSpread
	   *   - InlineFragment
	   */
	  ;

	  _proto.parseSelection = function parseSelection() {
	    return this.peek(TokenKind.SPREAD) ? this.parseFragment() : this.parseField();
	  }
	  /**
	   * Field : Alias? Name Arguments? Directives? SelectionSet?
	   *
	   * Alias : Name :
	   */
	  ;

	  _proto.parseField = function parseField() {
	    var start = this._lexer.token;
	    var nameOrAlias = this.parseName();
	    var alias;
	    var name;

	    if (this.expectOptionalToken(TokenKind.COLON)) {
	      alias = nameOrAlias;
	      name = this.parseName();
	    } else {
	      name = nameOrAlias;
	    }

	    return {
	      kind: Kind.FIELD,
	      alias: alias,
	      name: name,
	      arguments: this.parseArguments(false),
	      directives: this.parseDirectives(false),
	      selectionSet: this.peek(TokenKind.BRACE_L) ? this.parseSelectionSet() : undefined,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * Arguments[Const] : ( Argument[?Const]+ )
	   */
	  ;

	  _proto.parseArguments = function parseArguments(isConst) {
	    var item = isConst ? this.parseConstArgument : this.parseArgument;
	    return this.optionalMany(TokenKind.PAREN_L, item, TokenKind.PAREN_R);
	  }
	  /**
	   * Argument[Const] : Name : Value[?Const]
	   */
	  ;

	  _proto.parseArgument = function parseArgument() {
	    var start = this._lexer.token;
	    var name = this.parseName();
	    this.expectToken(TokenKind.COLON);
	    return {
	      kind: Kind.ARGUMENT,
	      name: name,
	      value: this.parseValueLiteral(false),
	      loc: this.loc(start)
	    };
	  };

	  _proto.parseConstArgument = function parseConstArgument() {
	    var start = this._lexer.token;
	    return {
	      kind: Kind.ARGUMENT,
	      name: this.parseName(),
	      value: (this.expectToken(TokenKind.COLON), this.parseValueLiteral(true)),
	      loc: this.loc(start)
	    };
	  } // Implements the parsing rules in the Fragments section.

	  /**
	   * Corresponds to both FragmentSpread and InlineFragment in the spec.
	   *
	   * FragmentSpread : ... FragmentName Directives?
	   *
	   * InlineFragment : ... TypeCondition? Directives? SelectionSet
	   */
	  ;

	  _proto.parseFragment = function parseFragment() {
	    var start = this._lexer.token;
	    this.expectToken(TokenKind.SPREAD);
	    var hasTypeCondition = this.expectOptionalKeyword('on');

	    if (!hasTypeCondition && this.peek(TokenKind.NAME)) {
	      return {
	        kind: Kind.FRAGMENT_SPREAD,
	        name: this.parseFragmentName(),
	        directives: this.parseDirectives(false),
	        loc: this.loc(start)
	      };
	    }

	    return {
	      kind: Kind.INLINE_FRAGMENT,
	      typeCondition: hasTypeCondition ? this.parseNamedType() : undefined,
	      directives: this.parseDirectives(false),
	      selectionSet: this.parseSelectionSet(),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * FragmentDefinition :
	   *   - fragment FragmentName on TypeCondition Directives? SelectionSet
	   *
	   * TypeCondition : NamedType
	   */
	  ;

	  _proto.parseFragmentDefinition = function parseFragmentDefinition() {
	    var start = this._lexer.token;
	    this.expectKeyword('fragment'); // Experimental support for defining variables within fragments changes
	    // the grammar of FragmentDefinition:
	    //   - fragment FragmentName VariableDefinitions? on TypeCondition Directives? SelectionSet

	    if (this._options.experimentalFragmentVariables) {
	      return {
	        kind: Kind.FRAGMENT_DEFINITION,
	        name: this.parseFragmentName(),
	        variableDefinitions: this.parseVariableDefinitions(),
	        typeCondition: (this.expectKeyword('on'), this.parseNamedType()),
	        directives: this.parseDirectives(false),
	        selectionSet: this.parseSelectionSet(),
	        loc: this.loc(start)
	      };
	    }

	    return {
	      kind: Kind.FRAGMENT_DEFINITION,
	      name: this.parseFragmentName(),
	      typeCondition: (this.expectKeyword('on'), this.parseNamedType()),
	      directives: this.parseDirectives(false),
	      selectionSet: this.parseSelectionSet(),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * FragmentName : Name but not `on`
	   */
	  ;

	  _proto.parseFragmentName = function parseFragmentName() {
	    if (this._lexer.token.value === 'on') {
	      throw this.unexpected();
	    }

	    return this.parseName();
	  } // Implements the parsing rules in the Values section.

	  /**
	   * Value[Const] :
	   *   - [~Const] Variable
	   *   - IntValue
	   *   - FloatValue
	   *   - StringValue
	   *   - BooleanValue
	   *   - NullValue
	   *   - EnumValue
	   *   - ListValue[?Const]
	   *   - ObjectValue[?Const]
	   *
	   * BooleanValue : one of `true` `false`
	   *
	   * NullValue : `null`
	   *
	   * EnumValue : Name but not `true`, `false` or `null`
	   */
	  ;

	  _proto.parseValueLiteral = function parseValueLiteral(isConst) {
	    var token = this._lexer.token;

	    switch (token.kind) {
	      case TokenKind.BRACKET_L:
	        return this.parseList(isConst);

	      case TokenKind.BRACE_L:
	        return this.parseObject(isConst);

	      case TokenKind.INT:
	        this._lexer.advance();

	        return {
	          kind: Kind.INT,
	          value: token.value,
	          loc: this.loc(token)
	        };

	      case TokenKind.FLOAT:
	        this._lexer.advance();

	        return {
	          kind: Kind.FLOAT,
	          value: token.value,
	          loc: this.loc(token)
	        };

	      case TokenKind.STRING:
	      case TokenKind.BLOCK_STRING:
	        return this.parseStringLiteral();

	      case TokenKind.NAME:
	        if (token.value === 'true' || token.value === 'false') {
	          this._lexer.advance();

	          return {
	            kind: Kind.BOOLEAN,
	            value: token.value === 'true',
	            loc: this.loc(token)
	          };
	        } else if (token.value === 'null') {
	          this._lexer.advance();

	          return {
	            kind: Kind.NULL,
	            loc: this.loc(token)
	          };
	        }

	        this._lexer.advance();

	        return {
	          kind: Kind.ENUM,
	          value: token.value,
	          loc: this.loc(token)
	        };

	      case TokenKind.DOLLAR:
	        if (!isConst) {
	          return this.parseVariable();
	        }

	        break;
	    }

	    throw this.unexpected();
	  };

	  _proto.parseStringLiteral = function parseStringLiteral() {
	    var token = this._lexer.token;

	    this._lexer.advance();

	    return {
	      kind: Kind.STRING,
	      value: token.value,
	      block: token.kind === TokenKind.BLOCK_STRING,
	      loc: this.loc(token)
	    };
	  }
	  /**
	   * ListValue[Const] :
	   *   - [ ]
	   *   - [ Value[?Const]+ ]
	   */
	  ;

	  _proto.parseList = function parseList(isConst) {
	    var _this = this;

	    var start = this._lexer.token;

	    var item = function item() {
	      return _this.parseValueLiteral(isConst);
	    };

	    return {
	      kind: Kind.LIST,
	      values: this.any(TokenKind.BRACKET_L, item, TokenKind.BRACKET_R),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * ObjectValue[Const] :
	   *   - { }
	   *   - { ObjectField[?Const]+ }
	   */
	  ;

	  _proto.parseObject = function parseObject(isConst) {
	    var _this2 = this;

	    var start = this._lexer.token;

	    var item = function item() {
	      return _this2.parseObjectField(isConst);
	    };

	    return {
	      kind: Kind.OBJECT,
	      fields: this.any(TokenKind.BRACE_L, item, TokenKind.BRACE_R),
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * ObjectField[Const] : Name : Value[?Const]
	   */
	  ;

	  _proto.parseObjectField = function parseObjectField(isConst) {
	    var start = this._lexer.token;
	    var name = this.parseName();
	    this.expectToken(TokenKind.COLON);
	    return {
	      kind: Kind.OBJECT_FIELD,
	      name: name,
	      value: this.parseValueLiteral(isConst),
	      loc: this.loc(start)
	    };
	  } // Implements the parsing rules in the Directives section.

	  /**
	   * Directives[Const] : Directive[?Const]+
	   */
	  ;

	  _proto.parseDirectives = function parseDirectives(isConst) {
	    var directives = [];

	    while (this.peek(TokenKind.AT)) {
	      directives.push(this.parseDirective(isConst));
	    }

	    return directives;
	  }
	  /**
	   * Directive[Const] : @ Name Arguments[?Const]?
	   */
	  ;

	  _proto.parseDirective = function parseDirective(isConst) {
	    var start = this._lexer.token;
	    this.expectToken(TokenKind.AT);
	    return {
	      kind: Kind.DIRECTIVE,
	      name: this.parseName(),
	      arguments: this.parseArguments(isConst),
	      loc: this.loc(start)
	    };
	  } // Implements the parsing rules in the Types section.

	  /**
	   * Type :
	   *   - NamedType
	   *   - ListType
	   *   - NonNullType
	   */
	  ;

	  _proto.parseTypeReference = function parseTypeReference() {
	    var start = this._lexer.token;
	    var type;

	    if (this.expectOptionalToken(TokenKind.BRACKET_L)) {
	      type = this.parseTypeReference();
	      this.expectToken(TokenKind.BRACKET_R);
	      type = {
	        kind: Kind.LIST_TYPE,
	        type: type,
	        loc: this.loc(start)
	      };
	    } else {
	      type = this.parseNamedType();
	    }

	    if (this.expectOptionalToken(TokenKind.BANG)) {
	      return {
	        kind: Kind.NON_NULL_TYPE,
	        type: type,
	        loc: this.loc(start)
	      };
	    }

	    return type;
	  }
	  /**
	   * NamedType : Name
	   */
	  ;

	  _proto.parseNamedType = function parseNamedType() {
	    var start = this._lexer.token;
	    return {
	      kind: Kind.NAMED_TYPE,
	      name: this.parseName(),
	      loc: this.loc(start)
	    };
	  } // Implements the parsing rules in the Type Definition section.

	  /**
	   * TypeSystemDefinition :
	   *   - SchemaDefinition
	   *   - TypeDefinition
	   *   - DirectiveDefinition
	   *
	   * TypeDefinition :
	   *   - ScalarTypeDefinition
	   *   - ObjectTypeDefinition
	   *   - InterfaceTypeDefinition
	   *   - UnionTypeDefinition
	   *   - EnumTypeDefinition
	   *   - InputObjectTypeDefinition
	   */
	  ;

	  _proto.parseTypeSystemDefinition = function parseTypeSystemDefinition() {
	    // Many definitions begin with a description and require a lookahead.
	    var keywordToken = this.peekDescription() ? this._lexer.lookahead() : this._lexer.token;

	    if (keywordToken.kind === TokenKind.NAME) {
	      switch (keywordToken.value) {
	        case 'schema':
	          return this.parseSchemaDefinition();

	        case 'scalar':
	          return this.parseScalarTypeDefinition();

	        case 'type':
	          return this.parseObjectTypeDefinition();

	        case 'interface':
	          return this.parseInterfaceTypeDefinition();

	        case 'union':
	          return this.parseUnionTypeDefinition();

	        case 'enum':
	          return this.parseEnumTypeDefinition();

	        case 'input':
	          return this.parseInputObjectTypeDefinition();

	        case 'directive':
	          return this.parseDirectiveDefinition();
	      }
	    }

	    throw this.unexpected(keywordToken);
	  };

	  _proto.peekDescription = function peekDescription() {
	    return this.peek(TokenKind.STRING) || this.peek(TokenKind.BLOCK_STRING);
	  }
	  /**
	   * Description : StringValue
	   */
	  ;

	  _proto.parseDescription = function parseDescription() {
	    if (this.peekDescription()) {
	      return this.parseStringLiteral();
	    }
	  }
	  /**
	   * SchemaDefinition : schema Directives[Const]? { OperationTypeDefinition+ }
	   */
	  ;

	  _proto.parseSchemaDefinition = function parseSchemaDefinition() {
	    var start = this._lexer.token;
	    this.expectKeyword('schema');
	    var directives = this.parseDirectives(true);
	    var operationTypes = this.many(TokenKind.BRACE_L, this.parseOperationTypeDefinition, TokenKind.BRACE_R);
	    return {
	      kind: Kind.SCHEMA_DEFINITION,
	      directives: directives,
	      operationTypes: operationTypes,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * OperationTypeDefinition : OperationType : NamedType
	   */
	  ;

	  _proto.parseOperationTypeDefinition = function parseOperationTypeDefinition() {
	    var start = this._lexer.token;
	    var operation = this.parseOperationType();
	    this.expectToken(TokenKind.COLON);
	    var type = this.parseNamedType();
	    return {
	      kind: Kind.OPERATION_TYPE_DEFINITION,
	      operation: operation,
	      type: type,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * ScalarTypeDefinition : Description? scalar Name Directives[Const]?
	   */
	  ;

	  _proto.parseScalarTypeDefinition = function parseScalarTypeDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    this.expectKeyword('scalar');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    return {
	      kind: Kind.SCALAR_TYPE_DEFINITION,
	      description: description,
	      name: name,
	      directives: directives,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * ObjectTypeDefinition :
	   *   Description?
	   *   type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition?
	   */
	  ;

	  _proto.parseObjectTypeDefinition = function parseObjectTypeDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    this.expectKeyword('type');
	    var name = this.parseName();
	    var interfaces = this.parseImplementsInterfaces();
	    var directives = this.parseDirectives(true);
	    var fields = this.parseFieldsDefinition();
	    return {
	      kind: Kind.OBJECT_TYPE_DEFINITION,
	      description: description,
	      name: name,
	      interfaces: interfaces,
	      directives: directives,
	      fields: fields,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * ImplementsInterfaces :
	   *   - implements `&`? NamedType
	   *   - ImplementsInterfaces & NamedType
	   */
	  ;

	  _proto.parseImplementsInterfaces = function parseImplementsInterfaces() {
	    var types = [];

	    if (this.expectOptionalKeyword('implements')) {
	      // Optional leading ampersand
	      this.expectOptionalToken(TokenKind.AMP);

	      do {
	        types.push(this.parseNamedType());
	      } while (this.expectOptionalToken(TokenKind.AMP) || // Legacy support for the SDL?
	      this._options.allowLegacySDLImplementsInterfaces && this.peek(TokenKind.NAME));
	    }

	    return types;
	  }
	  /**
	   * FieldsDefinition : { FieldDefinition+ }
	   */
	  ;

	  _proto.parseFieldsDefinition = function parseFieldsDefinition() {
	    // Legacy support for the SDL?
	    if (this._options.allowLegacySDLEmptyFields && this.peek(TokenKind.BRACE_L) && this._lexer.lookahead().kind === TokenKind.BRACE_R) {
	      this._lexer.advance();

	      this._lexer.advance();

	      return [];
	    }

	    return this.optionalMany(TokenKind.BRACE_L, this.parseFieldDefinition, TokenKind.BRACE_R);
	  }
	  /**
	   * FieldDefinition :
	   *   - Description? Name ArgumentsDefinition? : Type Directives[Const]?
	   */
	  ;

	  _proto.parseFieldDefinition = function parseFieldDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    var name = this.parseName();
	    var args = this.parseArgumentDefs();
	    this.expectToken(TokenKind.COLON);
	    var type = this.parseTypeReference();
	    var directives = this.parseDirectives(true);
	    return {
	      kind: Kind.FIELD_DEFINITION,
	      description: description,
	      name: name,
	      arguments: args,
	      type: type,
	      directives: directives,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * ArgumentsDefinition : ( InputValueDefinition+ )
	   */
	  ;

	  _proto.parseArgumentDefs = function parseArgumentDefs() {
	    return this.optionalMany(TokenKind.PAREN_L, this.parseInputValueDef, TokenKind.PAREN_R);
	  }
	  /**
	   * InputValueDefinition :
	   *   - Description? Name : Type DefaultValue? Directives[Const]?
	   */
	  ;

	  _proto.parseInputValueDef = function parseInputValueDef() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    var name = this.parseName();
	    this.expectToken(TokenKind.COLON);
	    var type = this.parseTypeReference();
	    var defaultValue;

	    if (this.expectOptionalToken(TokenKind.EQUALS)) {
	      defaultValue = this.parseValueLiteral(true);
	    }

	    var directives = this.parseDirectives(true);
	    return {
	      kind: Kind.INPUT_VALUE_DEFINITION,
	      description: description,
	      name: name,
	      type: type,
	      defaultValue: defaultValue,
	      directives: directives,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * InterfaceTypeDefinition :
	   *   - Description? interface Name Directives[Const]? FieldsDefinition?
	   */
	  ;

	  _proto.parseInterfaceTypeDefinition = function parseInterfaceTypeDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    this.expectKeyword('interface');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    var fields = this.parseFieldsDefinition();
	    return {
	      kind: Kind.INTERFACE_TYPE_DEFINITION,
	      description: description,
	      name: name,
	      directives: directives,
	      fields: fields,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * UnionTypeDefinition :
	   *   - Description? union Name Directives[Const]? UnionMemberTypes?
	   */
	  ;

	  _proto.parseUnionTypeDefinition = function parseUnionTypeDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    this.expectKeyword('union');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    var types = this.parseUnionMemberTypes();
	    return {
	      kind: Kind.UNION_TYPE_DEFINITION,
	      description: description,
	      name: name,
	      directives: directives,
	      types: types,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * UnionMemberTypes :
	   *   - = `|`? NamedType
	   *   - UnionMemberTypes | NamedType
	   */
	  ;

	  _proto.parseUnionMemberTypes = function parseUnionMemberTypes() {
	    var types = [];

	    if (this.expectOptionalToken(TokenKind.EQUALS)) {
	      // Optional leading pipe
	      this.expectOptionalToken(TokenKind.PIPE);

	      do {
	        types.push(this.parseNamedType());
	      } while (this.expectOptionalToken(TokenKind.PIPE));
	    }

	    return types;
	  }
	  /**
	   * EnumTypeDefinition :
	   *   - Description? enum Name Directives[Const]? EnumValuesDefinition?
	   */
	  ;

	  _proto.parseEnumTypeDefinition = function parseEnumTypeDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    this.expectKeyword('enum');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    var values = this.parseEnumValuesDefinition();
	    return {
	      kind: Kind.ENUM_TYPE_DEFINITION,
	      description: description,
	      name: name,
	      directives: directives,
	      values: values,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * EnumValuesDefinition : { EnumValueDefinition+ }
	   */
	  ;

	  _proto.parseEnumValuesDefinition = function parseEnumValuesDefinition() {
	    return this.optionalMany(TokenKind.BRACE_L, this.parseEnumValueDefinition, TokenKind.BRACE_R);
	  }
	  /**
	   * EnumValueDefinition : Description? EnumValue Directives[Const]?
	   *
	   * EnumValue : Name
	   */
	  ;

	  _proto.parseEnumValueDefinition = function parseEnumValueDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    return {
	      kind: Kind.ENUM_VALUE_DEFINITION,
	      description: description,
	      name: name,
	      directives: directives,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * InputObjectTypeDefinition :
	   *   - Description? input Name Directives[Const]? InputFieldsDefinition?
	   */
	  ;

	  _proto.parseInputObjectTypeDefinition = function parseInputObjectTypeDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    this.expectKeyword('input');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    var fields = this.parseInputFieldsDefinition();
	    return {
	      kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
	      description: description,
	      name: name,
	      directives: directives,
	      fields: fields,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * InputFieldsDefinition : { InputValueDefinition+ }
	   */
	  ;

	  _proto.parseInputFieldsDefinition = function parseInputFieldsDefinition() {
	    return this.optionalMany(TokenKind.BRACE_L, this.parseInputValueDef, TokenKind.BRACE_R);
	  }
	  /**
	   * TypeSystemExtension :
	   *   - SchemaExtension
	   *   - TypeExtension
	   *
	   * TypeExtension :
	   *   - ScalarTypeExtension
	   *   - ObjectTypeExtension
	   *   - InterfaceTypeExtension
	   *   - UnionTypeExtension
	   *   - EnumTypeExtension
	   *   - InputObjectTypeDefinition
	   */
	  ;

	  _proto.parseTypeSystemExtension = function parseTypeSystemExtension() {
	    var keywordToken = this._lexer.lookahead();

	    if (keywordToken.kind === TokenKind.NAME) {
	      switch (keywordToken.value) {
	        case 'schema':
	          return this.parseSchemaExtension();

	        case 'scalar':
	          return this.parseScalarTypeExtension();

	        case 'type':
	          return this.parseObjectTypeExtension();

	        case 'interface':
	          return this.parseInterfaceTypeExtension();

	        case 'union':
	          return this.parseUnionTypeExtension();

	        case 'enum':
	          return this.parseEnumTypeExtension();

	        case 'input':
	          return this.parseInputObjectTypeExtension();
	      }
	    }

	    throw this.unexpected(keywordToken);
	  }
	  /**
	   * SchemaExtension :
	   *  - extend schema Directives[Const]? { OperationTypeDefinition+ }
	   *  - extend schema Directives[Const]
	   */
	  ;

	  _proto.parseSchemaExtension = function parseSchemaExtension() {
	    var start = this._lexer.token;
	    this.expectKeyword('extend');
	    this.expectKeyword('schema');
	    var directives = this.parseDirectives(true);
	    var operationTypes = this.optionalMany(TokenKind.BRACE_L, this.parseOperationTypeDefinition, TokenKind.BRACE_R);

	    if (directives.length === 0 && operationTypes.length === 0) {
	      throw this.unexpected();
	    }

	    return {
	      kind: Kind.SCHEMA_EXTENSION,
	      directives: directives,
	      operationTypes: operationTypes,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * ScalarTypeExtension :
	   *   - extend scalar Name Directives[Const]
	   */
	  ;

	  _proto.parseScalarTypeExtension = function parseScalarTypeExtension() {
	    var start = this._lexer.token;
	    this.expectKeyword('extend');
	    this.expectKeyword('scalar');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);

	    if (directives.length === 0) {
	      throw this.unexpected();
	    }

	    return {
	      kind: Kind.SCALAR_TYPE_EXTENSION,
	      name: name,
	      directives: directives,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * ObjectTypeExtension :
	   *  - extend type Name ImplementsInterfaces? Directives[Const]? FieldsDefinition
	   *  - extend type Name ImplementsInterfaces? Directives[Const]
	   *  - extend type Name ImplementsInterfaces
	   */
	  ;

	  _proto.parseObjectTypeExtension = function parseObjectTypeExtension() {
	    var start = this._lexer.token;
	    this.expectKeyword('extend');
	    this.expectKeyword('type');
	    var name = this.parseName();
	    var interfaces = this.parseImplementsInterfaces();
	    var directives = this.parseDirectives(true);
	    var fields = this.parseFieldsDefinition();

	    if (interfaces.length === 0 && directives.length === 0 && fields.length === 0) {
	      throw this.unexpected();
	    }

	    return {
	      kind: Kind.OBJECT_TYPE_EXTENSION,
	      name: name,
	      interfaces: interfaces,
	      directives: directives,
	      fields: fields,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * InterfaceTypeExtension :
	   *   - extend interface Name Directives[Const]? FieldsDefinition
	   *   - extend interface Name Directives[Const]
	   */
	  ;

	  _proto.parseInterfaceTypeExtension = function parseInterfaceTypeExtension() {
	    var start = this._lexer.token;
	    this.expectKeyword('extend');
	    this.expectKeyword('interface');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    var fields = this.parseFieldsDefinition();

	    if (directives.length === 0 && fields.length === 0) {
	      throw this.unexpected();
	    }

	    return {
	      kind: Kind.INTERFACE_TYPE_EXTENSION,
	      name: name,
	      directives: directives,
	      fields: fields,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * UnionTypeExtension :
	   *   - extend union Name Directives[Const]? UnionMemberTypes
	   *   - extend union Name Directives[Const]
	   */
	  ;

	  _proto.parseUnionTypeExtension = function parseUnionTypeExtension() {
	    var start = this._lexer.token;
	    this.expectKeyword('extend');
	    this.expectKeyword('union');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    var types = this.parseUnionMemberTypes();

	    if (directives.length === 0 && types.length === 0) {
	      throw this.unexpected();
	    }

	    return {
	      kind: Kind.UNION_TYPE_EXTENSION,
	      name: name,
	      directives: directives,
	      types: types,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * EnumTypeExtension :
	   *   - extend enum Name Directives[Const]? EnumValuesDefinition
	   *   - extend enum Name Directives[Const]
	   */
	  ;

	  _proto.parseEnumTypeExtension = function parseEnumTypeExtension() {
	    var start = this._lexer.token;
	    this.expectKeyword('extend');
	    this.expectKeyword('enum');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    var values = this.parseEnumValuesDefinition();

	    if (directives.length === 0 && values.length === 0) {
	      throw this.unexpected();
	    }

	    return {
	      kind: Kind.ENUM_TYPE_EXTENSION,
	      name: name,
	      directives: directives,
	      values: values,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * InputObjectTypeExtension :
	   *   - extend input Name Directives[Const]? InputFieldsDefinition
	   *   - extend input Name Directives[Const]
	   */
	  ;

	  _proto.parseInputObjectTypeExtension = function parseInputObjectTypeExtension() {
	    var start = this._lexer.token;
	    this.expectKeyword('extend');
	    this.expectKeyword('input');
	    var name = this.parseName();
	    var directives = this.parseDirectives(true);
	    var fields = this.parseInputFieldsDefinition();

	    if (directives.length === 0 && fields.length === 0) {
	      throw this.unexpected();
	    }

	    return {
	      kind: Kind.INPUT_OBJECT_TYPE_EXTENSION,
	      name: name,
	      directives: directives,
	      fields: fields,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * DirectiveDefinition :
	   *   - Description? directive @ Name ArgumentsDefinition? `repeatable`? on DirectiveLocations
	   */
	  ;

	  _proto.parseDirectiveDefinition = function parseDirectiveDefinition() {
	    var start = this._lexer.token;
	    var description = this.parseDescription();
	    this.expectKeyword('directive');
	    this.expectToken(TokenKind.AT);
	    var name = this.parseName();
	    var args = this.parseArgumentDefs();
	    var repeatable = this.expectOptionalKeyword('repeatable');
	    this.expectKeyword('on');
	    var locations = this.parseDirectiveLocations();
	    return {
	      kind: Kind.DIRECTIVE_DEFINITION,
	      description: description,
	      name: name,
	      arguments: args,
	      repeatable: repeatable,
	      locations: locations,
	      loc: this.loc(start)
	    };
	  }
	  /**
	   * DirectiveLocations :
	   *   - `|`? DirectiveLocation
	   *   - DirectiveLocations | DirectiveLocation
	   */
	  ;

	  _proto.parseDirectiveLocations = function parseDirectiveLocations() {
	    // Optional leading pipe
	    this.expectOptionalToken(TokenKind.PIPE);
	    var locations = [];

	    do {
	      locations.push(this.parseDirectiveLocation());
	    } while (this.expectOptionalToken(TokenKind.PIPE));

	    return locations;
	  }
	  /*
	   * DirectiveLocation :
	   *   - ExecutableDirectiveLocation
	   *   - TypeSystemDirectiveLocation
	   *
	   * ExecutableDirectiveLocation : one of
	   *   `QUERY`
	   *   `MUTATION`
	   *   `SUBSCRIPTION`
	   *   `FIELD`
	   *   `FRAGMENT_DEFINITION`
	   *   `FRAGMENT_SPREAD`
	   *   `INLINE_FRAGMENT`
	   *
	   * TypeSystemDirectiveLocation : one of
	   *   `SCHEMA`
	   *   `SCALAR`
	   *   `OBJECT`
	   *   `FIELD_DEFINITION`
	   *   `ARGUMENT_DEFINITION`
	   *   `INTERFACE`
	   *   `UNION`
	   *   `ENUM`
	   *   `ENUM_VALUE`
	   *   `INPUT_OBJECT`
	   *   `INPUT_FIELD_DEFINITION`
	   */
	  ;

	  _proto.parseDirectiveLocation = function parseDirectiveLocation() {
	    var start = this._lexer.token;
	    var name = this.parseName();

	    if (DirectiveLocation[name.value] !== undefined) {
	      return name;
	    }

	    throw this.unexpected(start);
	  } // Core parsing utility functions

	  /**
	   * Returns a location object, used to identify the place in
	   * the source that created a given parsed object.
	   */
	  ;

	  _proto.loc = function loc(startToken) {
	    if (!this._options.noLocation) {
	      return new Loc(startToken, this._lexer.lastToken, this._lexer.source);
	    }
	  }
	  /**
	   * Determines if the next token is of a given kind
	   */
	  ;

	  _proto.peek = function peek(kind) {
	    return this._lexer.token.kind === kind;
	  }
	  /**
	   * If the next token is of the given kind, return that token after advancing
	   * the lexer. Otherwise, do not change the parser state and throw an error.
	   */
	  ;

	  _proto.expectToken = function expectToken(kind) {
	    var token = this._lexer.token;

	    if (token.kind === kind) {
	      this._lexer.advance();

	      return token;
	    }

	    throw syntaxError(this._lexer.source, token.start, "Expected ".concat(kind, ", found ").concat(getTokenDesc(token)));
	  }
	  /**
	   * If the next token is of the given kind, return that token after advancing
	   * the lexer. Otherwise, do not change the parser state and return undefined.
	   */
	  ;

	  _proto.expectOptionalToken = function expectOptionalToken(kind) {
	    var token = this._lexer.token;

	    if (token.kind === kind) {
	      this._lexer.advance();

	      return token;
	    }

	    return undefined;
	  }
	  /**
	   * If the next token is a given keyword, advance the lexer.
	   * Otherwise, do not change the parser state and throw an error.
	   */
	  ;

	  _proto.expectKeyword = function expectKeyword(value) {
	    var token = this._lexer.token;

	    if (token.kind === TokenKind.NAME && token.value === value) {
	      this._lexer.advance();
	    } else {
	      throw syntaxError(this._lexer.source, token.start, "Expected \"".concat(value, "\", found ").concat(getTokenDesc(token)));
	    }
	  }
	  /**
	   * If the next token is a given keyword, return "true" after advancing
	   * the lexer. Otherwise, do not change the parser state and return "false".
	   */
	  ;

	  _proto.expectOptionalKeyword = function expectOptionalKeyword(value) {
	    var token = this._lexer.token;

	    if (token.kind === TokenKind.NAME && token.value === value) {
	      this._lexer.advance();

	      return true;
	    }

	    return false;
	  }
	  /**
	   * Helper function for creating an error when an unexpected lexed token
	   * is encountered.
	   */
	  ;

	  _proto.unexpected = function unexpected(atToken) {
	    var token = atToken || this._lexer.token;
	    return syntaxError(this._lexer.source, token.start, "Unexpected ".concat(getTokenDesc(token)));
	  }
	  /**
	   * Returns a possibly empty list of parse nodes, determined by
	   * the parseFn. This list begins with a lex token of openKind
	   * and ends with a lex token of closeKind. Advances the parser
	   * to the next lex token after the closing token.
	   */
	  ;

	  _proto.any = function any(openKind, parseFn, closeKind) {
	    this.expectToken(openKind);
	    var nodes = [];

	    while (!this.expectOptionalToken(closeKind)) {
	      nodes.push(parseFn.call(this));
	    }

	    return nodes;
	  }
	  /**
	   * Returns a list of parse nodes, determined by the parseFn.
	   * It can be empty only if open token is missing otherwise it will always
	   * return non-empty list that begins with a lex token of openKind and ends
	   * with a lex token of closeKind. Advances the parser to the next lex token
	   * after the closing token.
	   */
	  ;

	  _proto.optionalMany = function optionalMany(openKind, parseFn, closeKind) {
	    if (this.expectOptionalToken(openKind)) {
	      var nodes = [];

	      do {
	        nodes.push(parseFn.call(this));
	      } while (!this.expectOptionalToken(closeKind));

	      return nodes;
	    }

	    return [];
	  }
	  /**
	   * Returns a non-empty list of parse nodes, determined by
	   * the parseFn. This list begins with a lex token of openKind
	   * and ends with a lex token of closeKind. Advances the parser
	   * to the next lex token after the closing token.
	   */
	  ;

	  _proto.many = function many(openKind, parseFn, closeKind) {
	    this.expectToken(openKind);
	    var nodes = [];

	    do {
	      nodes.push(parseFn.call(this));
	    } while (!this.expectOptionalToken(closeKind));

	    return nodes;
	  };

	  return Parser;
	}();

	function Loc(startToken, endToken, source) {
	  this.start = startToken.start;
	  this.end = endToken.end;
	  this.startToken = startToken;
	  this.endToken = endToken;
	  this.source = source;
	} // Print a simplified form when appearing in JSON/util.inspect.


	defineToJSON(Loc, function () {
	  return {
	    start: this.start,
	    end: this.end
	  };
	});
	/**
	 * A helper function to describe a token as a string for debugging
	 */

	function getTokenDesc(token) {
	  var value = token.value;
	  return value ? "".concat(token.kind, " \"").concat(value, "\"") : token.kind;
	}

	var QueryDocumentKeys = {
	  Name: [],
	  Document: ['definitions'],
	  OperationDefinition: ['name', 'variableDefinitions', 'directives', 'selectionSet'],
	  VariableDefinition: ['variable', 'type', 'defaultValue', 'directives'],
	  Variable: ['name'],
	  SelectionSet: ['selections'],
	  Field: ['alias', 'name', 'arguments', 'directives', 'selectionSet'],
	  Argument: ['name', 'value'],
	  FragmentSpread: ['name', 'directives'],
	  InlineFragment: ['typeCondition', 'directives', 'selectionSet'],
	  FragmentDefinition: ['name', // Note: fragment variable definitions are experimental and may be changed
	  // or removed in the future.
	  'variableDefinitions', 'typeCondition', 'directives', 'selectionSet'],
	  IntValue: [],
	  FloatValue: [],
	  StringValue: [],
	  BooleanValue: [],
	  NullValue: [],
	  EnumValue: [],
	  ListValue: ['values'],
	  ObjectValue: ['fields'],
	  ObjectField: ['name', 'value'],
	  Directive: ['name', 'arguments'],
	  NamedType: ['name'],
	  ListType: ['type'],
	  NonNullType: ['type'],
	  SchemaDefinition: ['directives', 'operationTypes'],
	  OperationTypeDefinition: ['type'],
	  ScalarTypeDefinition: ['description', 'name', 'directives'],
	  ObjectTypeDefinition: ['description', 'name', 'interfaces', 'directives', 'fields'],
	  FieldDefinition: ['description', 'name', 'arguments', 'type', 'directives'],
	  InputValueDefinition: ['description', 'name', 'type', 'defaultValue', 'directives'],
	  InterfaceTypeDefinition: ['description', 'name', 'directives', 'fields'],
	  UnionTypeDefinition: ['description', 'name', 'directives', 'types'],
	  EnumTypeDefinition: ['description', 'name', 'directives', 'values'],
	  EnumValueDefinition: ['description', 'name', 'directives'],
	  InputObjectTypeDefinition: ['description', 'name', 'directives', 'fields'],
	  DirectiveDefinition: ['description', 'name', 'arguments', 'locations'],
	  SchemaExtension: ['directives', 'operationTypes'],
	  ScalarTypeExtension: ['name', 'directives'],
	  ObjectTypeExtension: ['name', 'interfaces', 'directives', 'fields'],
	  InterfaceTypeExtension: ['name', 'directives', 'fields'],
	  UnionTypeExtension: ['name', 'directives', 'types'],
	  EnumTypeExtension: ['name', 'directives', 'values'],
	  InputObjectTypeExtension: ['name', 'directives', 'fields']
	};
	var BREAK = Object.freeze({});
	/**
	 * visit() will walk through an AST using a depth first traversal, calling
	 * the visitor's enter function at each node in the traversal, and calling the
	 * leave function after visiting that node and all of its child nodes.
	 *
	 * By returning different values from the enter and leave functions, the
	 * behavior of the visitor can be altered, including skipping over a sub-tree of
	 * the AST (by returning false), editing the AST by returning a value or null
	 * to remove the value, or to stop the whole traversal by returning BREAK.
	 *
	 * When using visit() to edit an AST, the original AST will not be modified, and
	 * a new version of the AST with the changes applied will be returned from the
	 * visit function.
	 *
	 *     const editedAST = visit(ast, {
	 *       enter(node, key, parent, path, ancestors) {
	 *         // @return
	 *         //   undefined: no action
	 *         //   false: skip visiting this node
	 *         //   visitor.BREAK: stop visiting altogether
	 *         //   null: delete this node
	 *         //   any value: replace this node with the returned value
	 *       },
	 *       leave(node, key, parent, path, ancestors) {
	 *         // @return
	 *         //   undefined: no action
	 *         //   false: no action
	 *         //   visitor.BREAK: stop visiting altogether
	 *         //   null: delete this node
	 *         //   any value: replace this node with the returned value
	 *       }
	 *     });
	 *
	 * Alternatively to providing enter() and leave() functions, a visitor can
	 * instead provide functions named the same as the kinds of AST nodes, or
	 * enter/leave visitors at a named key, leading to four permutations of
	 * visitor API:
	 *
	 * 1) Named visitors triggered when entering a node a specific kind.
	 *
	 *     visit(ast, {
	 *       Kind(node) {
	 *         // enter the "Kind" node
	 *       }
	 *     })
	 *
	 * 2) Named visitors that trigger upon entering and leaving a node of
	 *    a specific kind.
	 *
	 *     visit(ast, {
	 *       Kind: {
	 *         enter(node) {
	 *           // enter the "Kind" node
	 *         }
	 *         leave(node) {
	 *           // leave the "Kind" node
	 *         }
	 *       }
	 *     })
	 *
	 * 3) Generic visitors that trigger upon entering and leaving any node.
	 *
	 *     visit(ast, {
	 *       enter(node) {
	 *         // enter any node
	 *       },
	 *       leave(node) {
	 *         // leave any node
	 *       }
	 *     })
	 *
	 * 4) Parallel visitors for entering and leaving nodes of a specific kind.
	 *
	 *     visit(ast, {
	 *       enter: {
	 *         Kind(node) {
	 *           // enter the "Kind" node
	 *         }
	 *       },
	 *       leave: {
	 *         Kind(node) {
	 *           // leave the "Kind" node
	 *         }
	 *       }
	 *     })
	 */

	function visit(root, visitor) {
	  var visitorKeys = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : QueryDocumentKeys;

	  /* eslint-disable no-undef-init */
	  var stack = undefined;
	  var inArray = Array.isArray(root);
	  var keys = [root];
	  var index = -1;
	  var edits = [];
	  var node = undefined;
	  var key = undefined;
	  var parent = undefined;
	  var path = [];
	  var ancestors = [];
	  var newRoot = root;
	  /* eslint-enable no-undef-init */

	  do {
	    index++;
	    var isLeaving = index === keys.length;
	    var isEdited = isLeaving && edits.length !== 0;

	    if (isLeaving) {
	      key = ancestors.length === 0 ? undefined : path[path.length - 1];
	      node = parent;
	      parent = ancestors.pop();

	      if (isEdited) {
	        if (inArray) {
	          node = node.slice();
	        } else {
	          var clone = {};

	          for (var _i2 = 0, _Object$keys2 = Object.keys(node); _i2 < _Object$keys2.length; _i2++) {
	            var k = _Object$keys2[_i2];
	            clone[k] = node[k];
	          }

	          node = clone;
	        }

	        var editOffset = 0;

	        for (var ii = 0; ii < edits.length; ii++) {
	          var editKey = edits[ii][0];
	          var editValue = edits[ii][1];

	          if (inArray) {
	            editKey -= editOffset;
	          }

	          if (inArray && editValue === null) {
	            node.splice(editKey, 1);
	            editOffset++;
	          } else {
	            node[editKey] = editValue;
	          }
	        }
	      }

	      index = stack.index;
	      keys = stack.keys;
	      edits = stack.edits;
	      inArray = stack.inArray;
	      stack = stack.prev;
	    } else {
	      key = parent ? inArray ? index : keys[index] : undefined;
	      node = parent ? parent[key] : newRoot;

	      if (node === null || node === undefined) {
	        continue;
	      }

	      if (parent) {
	        path.push(key);
	      }
	    }

	    var result = void 0;

	    if (!Array.isArray(node)) {
	      if (!isNode(node)) {
	        throw new Error('Invalid AST Node: ' + inspect(node));
	      }

	      var visitFn = getVisitFn(visitor, node.kind, isLeaving);

	      if (visitFn) {
	        result = visitFn.call(visitor, node, key, parent, path, ancestors);

	        if (result === BREAK) {
	          break;
	        }

	        if (result === false) {
	          if (!isLeaving) {
	            path.pop();
	            continue;
	          }
	        } else if (result !== undefined) {
	          edits.push([key, result]);

	          if (!isLeaving) {
	            if (isNode(result)) {
	              node = result;
	            } else {
	              path.pop();
	              continue;
	            }
	          }
	        }
	      }
	    }

	    if (result === undefined && isEdited) {
	      edits.push([key, node]);
	    }

	    if (isLeaving) {
	      path.pop();
	    } else {
	      stack = {
	        inArray: inArray,
	        index: index,
	        keys: keys,
	        edits: edits,
	        prev: stack
	      };
	      inArray = Array.isArray(node);
	      keys = inArray ? node : visitorKeys[node.kind] || [];
	      index = -1;
	      edits = [];

	      if (parent) {
	        ancestors.push(parent);
	      }

	      parent = node;
	    }
	  } while (stack !== undefined);

	  if (edits.length !== 0) {
	    newRoot = edits[edits.length - 1][1];
	  }

	  return newRoot;
	}

	function isNode(maybeNode) {
	  return Boolean(maybeNode && typeof maybeNode.kind === 'string');
	}
	/**
	 * Creates a new visitor instance which delegates to many visitors to run in
	 * parallel. Each visitor will be visited for each node before moving on.
	 *
	 * If a prior visitor edits a node, no following visitors will see that node.
	 */


	function visitInParallel(visitors) {
	  var skipping = new Array(visitors.length);
	  return {
	    enter: function enter(node) {
	      for (var i = 0; i < visitors.length; i++) {
	        if (!skipping[i]) {
	          var fn = getVisitFn(visitors[i], node.kind,
	          /* isLeaving */
	          false);

	          if (fn) {
	            var result = fn.apply(visitors[i], arguments);

	            if (result === false) {
	              skipping[i] = node;
	            } else if (result === BREAK) {
	              skipping[i] = BREAK;
	            } else if (result !== undefined) {
	              return result;
	            }
	          }
	        }
	      }
	    },
	    leave: function leave(node) {
	      for (var i = 0; i < visitors.length; i++) {
	        if (!skipping[i]) {
	          var fn = getVisitFn(visitors[i], node.kind,
	          /* isLeaving */
	          true);

	          if (fn) {
	            var result = fn.apply(visitors[i], arguments);

	            if (result === BREAK) {
	              skipping[i] = BREAK;
	            } else if (result !== undefined && result !== false) {
	              return result;
	            }
	          }
	        } else if (skipping[i] === node) {
	          skipping[i] = null;
	        }
	      }
	    }
	  };
	}
	/**
	 * Creates a new visitor instance which maintains a provided TypeInfo instance
	 * along with visiting visitor.
	 */

	function visitWithTypeInfo(typeInfo, visitor) {
	  return {
	    enter: function enter(node) {
	      typeInfo.enter(node);
	      var fn = getVisitFn(visitor, node.kind,
	      /* isLeaving */
	      false);

	      if (fn) {
	        var result = fn.apply(visitor, arguments);

	        if (result !== undefined) {
	          typeInfo.leave(node);

	          if (isNode(result)) {
	            typeInfo.enter(result);
	          }
	        }

	        return result;
	      }
	    },
	    leave: function leave(node) {
	      var fn = getVisitFn(visitor, node.kind,
	      /* isLeaving */
	      true);
	      var result;

	      if (fn) {
	        result = fn.apply(visitor, arguments);
	      }

	      typeInfo.leave(node);
	      return result;
	    }
	  };
	}
	/**
	 * Given a visitor instance, if it is leaving or not, and a node kind, return
	 * the function the visitor runtime should call.
	 */

	function getVisitFn(visitor, kind, isLeaving) {
	  var kindVisitor = visitor[kind];

	  if (kindVisitor) {
	    if (!isLeaving && typeof kindVisitor === 'function') {
	      // { Kind() {} }
	      return kindVisitor;
	    }

	    var kindSpecificVisitor = isLeaving ? kindVisitor.leave : kindVisitor.enter;

	    if (typeof kindSpecificVisitor === 'function') {
	      // { Kind: { enter() {}, leave() {} } }
	      return kindSpecificVisitor;
	    }
	  } else {
	    var specificVisitor = isLeaving ? visitor.leave : visitor.enter;

	    if (specificVisitor) {
	      if (typeof specificVisitor === 'function') {
	        // { enter() {}, leave() {} }
	        return specificVisitor;
	      }

	      var specificKindVisitor = specificVisitor[kind];

	      if (typeof specificKindVisitor === 'function') {
	        // { enter: { Kind() {} }, leave: { Kind() {} } }
	        return specificKindVisitor;
	      }
	    }
	  }
	}

	var visitor = /*#__PURE__*/Object.freeze({
		__proto__: null,
		QueryDocumentKeys: QueryDocumentKeys,
		BREAK: BREAK,
		visit: visit,
		visitInParallel: visitInParallel,
		visitWithTypeInfo: visitWithTypeInfo,
		getVisitFn: getVisitFn
	});

	/* eslint-disable no-redeclare */
	// $FlowFixMe
	var find = Array.prototype.find ? function (list, predicate) {
	  return Array.prototype.find.call(list, predicate);
	} : function (list, predicate) {
	  for (var _i2 = 0; _i2 < list.length; _i2++) {
	    var value = list[_i2];

	    if (predicate(value)) {
	      return value;
	    }
	  }
	};

	// Workaround to make older Flow versions happy
	var flatMapMethod = Array.prototype.flatMap;
	/* eslint-disable no-redeclare */
	// $FlowFixMe

	var flatMap$1 = flatMapMethod ? function (list, fn) {
	  return flatMapMethod.call(list, fn);
	} : function (list, fn) {
	  var result = [];

	  for (var _i2 = 0; _i2 < list.length; _i2++) {
	    var _item = list[_i2];
	    var value = fn(_item);

	    if (Array.isArray(value)) {
	      result = result.concat(value);
	    } else {
	      result.push(value);
	    }
	  }

	  return result;
	};

	/* eslint-disable no-redeclare */
	// $FlowFixMe workaround for: https://github.com/facebook/flow/issues/2221
	var objectValues = Object.values || function (obj) {
	  return Object.keys(obj).map(function (key) {
	    return obj[key];
	  });
	};

	/* eslint-disable no-redeclare */
	// $FlowFixMe workaround for: https://github.com/facebook/flow/issues/5838
	var objectEntries = Object.entries || function (obj) {
	  return Object.keys(obj).map(function (key) {
	    return [key, obj[key]];
	  });
	};

	var NAME_RX = /^[_a-zA-Z][_a-zA-Z0-9]*$/;
	/**
	 * Upholds the spec rules about naming.
	 */

	function assertValidName(name) {
	  var error = isValidNameError(name);

	  if (error) {
	    throw error;
	  }

	  return name;
	}
	/**
	 * Returns an Error if a name is invalid.
	 */

	function isValidNameError(name, node) {
	  typeof name === 'string' || devAssert(0, 'Expected string');

	  if (name.length > 1 && name[0] === '_' && name[1] === '_') {
	    return new GraphQLError("Name \"".concat(name, "\" must not begin with \"__\", which is reserved by GraphQL introspection."), node);
	  }

	  if (!NAME_RX.test(name)) {
	    return new GraphQLError("Names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/ but \"".concat(name, "\" does not."), node);
	  }
	}

	/**
	 * Creates a keyed JS object from an array, given a function to produce the keys
	 * for each value in the array.
	 *
	 * This provides a convenient lookup for the array items if the key function
	 * produces unique results.
	 *
	 *     const phoneBook = [
	 *       { name: 'Jon', num: '555-1234' },
	 *       { name: 'Jenny', num: '867-5309' }
	 *     ]
	 *
	 *     // { Jon: { name: 'Jon', num: '555-1234' },
	 *     //   Jenny: { name: 'Jenny', num: '867-5309' } }
	 *     const entriesByName = keyMap(
	 *       phoneBook,
	 *       entry => entry.name
	 *     )
	 *
	 *     // { name: 'Jenny', num: '857-6309' }
	 *     const jennyEntry = entriesByName['Jenny']
	 *
	 */
	function keyMap(list, keyFn) {
	  return list.reduce(function (map, item) {
	    map[keyFn(item)] = item;
	    return map;
	  }, Object.create(null));
	}

	/**
	 * Creates an object map with the same keys as `map` and values generated by
	 * running each value of `map` thru `fn`.
	 */
	function mapValue(map, fn) {
	  var result = Object.create(null);

	  for (var _i2 = 0, _objectEntries2 = objectEntries(map); _i2 < _objectEntries2.length; _i2++) {
	    var _ref2 = _objectEntries2[_i2];
	    var _key = _ref2[0];
	    var _value = _ref2[1];
	    result[_key] = fn(_value, _key);
	  }

	  return result;
	}

	function toObjMap(obj) {
	  /* eslint-enable no-redeclare */
	  if (Object.getPrototypeOf(obj) === null) {
	    return obj;
	  }

	  var map = Object.create(null);

	  for (var _i2 = 0, _objectEntries2 = objectEntries(obj); _i2 < _objectEntries2.length; _i2++) {
	    var _ref2 = _objectEntries2[_i2];
	    var key = _ref2[0];
	    var value = _ref2[1];
	    map[key] = value;
	  }

	  return map;
	}

	/**
	 * Creates a keyed JS object from an array, given a function to produce the keys
	 * and a function to produce the values from each item in the array.
	 *
	 *     const phoneBook = [
	 *       { name: 'Jon', num: '555-1234' },
	 *       { name: 'Jenny', num: '867-5309' }
	 *     ]
	 *
	 *     // { Jon: '555-1234', Jenny: '867-5309' }
	 *     const phonesByName = keyValMap(
	 *       phoneBook,
	 *       entry => entry.name,
	 *       entry => entry.num
	 *     )
	 *
	 */
	function keyValMap(list, keyFn, valFn) {
	  return list.reduce(function (map, item) {
	    map[keyFn(item)] = valFn(item);
	    return map;
	  }, Object.create(null));
	}

	/**
	 * A replacement for instanceof which includes an error warning when multi-realm
	 * constructors are detected.
	 */
	// See: https://expressjs.com/en/advanced/best-practice-performance.html#set-node_env-to-production
	// See: https://webpack.js.org/guides/production/
	var instanceOf = process.env.NODE_ENV === 'production' ? // eslint-disable-next-line no-shadow
	function instanceOf(value, constructor) {
	  return value instanceof constructor;
	} : // eslint-disable-next-line no-shadow
	function instanceOf(value, constructor) {
	  if (value instanceof constructor) {
	    return true;
	  }

	  if (value) {
	    var valueClass = value.constructor;
	    var className = constructor.name;

	    if (className && valueClass && valueClass.name === className) {
	      throw new Error("Cannot use ".concat(className, " \"").concat(value, "\" from another module or realm.\n\nEnsure that there is only one instance of \"graphql\" in the node_modules\ndirectory. If different versions of \"graphql\" are the dependencies of other\nrelied on modules, use \"resolutions\" to ensure only one version is installed.\n\nhttps://yarnpkg.com/en/docs/selective-version-resolutions\n\nDuplicate \"graphql\" modules cannot be used at the same time since different\nversions may have different capabilities and behavior. The data from one\nversion used in the function from another could produce confusing and\nspurious results."));
	    }
	  }

	  return false;
	};

	/**
	 * Returns the first argument it receives.
	 */
	function identityFunc(x) {
	  return x;
	}

	function invariant(condition, message) {
	  var booleanCondition = Boolean(condition);

	  if (!booleanCondition) {
	    throw new Error(message || 'Unexpected invariant triggered');
	  }
	}

	/**
	 * Returns true if a value is undefined, or NaN.
	 */
	function isInvalid(value) {
	  return value === undefined || value !== value;
	}

	/**
	 * Produces a JavaScript value given a GraphQL Value AST.
	 *
	 * Unlike `valueFromAST()`, no type is provided. The resulting JavaScript value
	 * will reflect the provided GraphQL value AST.
	 *
	 * | GraphQL Value        | JavaScript Value |
	 * | -------------------- | ---------------- |
	 * | Input Object         | Object           |
	 * | List                 | Array            |
	 * | Boolean              | Boolean          |
	 * | String / Enum        | String           |
	 * | Int / Float          | Number           |
	 * | Null                 | null             |
	 *
	 */
	function valueFromASTUntyped(valueNode, variables) {
	  switch (valueNode.kind) {
	    case Kind.NULL:
	      return null;

	    case Kind.INT:
	      return parseInt(valueNode.value, 10);

	    case Kind.FLOAT:
	      return parseFloat(valueNode.value);

	    case Kind.STRING:
	    case Kind.ENUM:
	    case Kind.BOOLEAN:
	      return valueNode.value;

	    case Kind.LIST:
	      return valueNode.values.map(function (node) {
	        return valueFromASTUntyped(node, variables);
	      });

	    case Kind.OBJECT:
	      return keyValMap(valueNode.fields, function (field) {
	        return field.name.value;
	      }, function (field) {
	        return valueFromASTUntyped(field.value, variables);
	      });

	    case Kind.VARIABLE:
	      {
	        var variableName = valueNode.name.value;
	        return variables && !isInvalid(variables[variableName]) ? variables[variableName] : undefined;
	      }
	  } // Not reachable. All possible value nodes have been considered.


	  /* istanbul ignore next */
	  invariant(false, 'Unexpected value node: ' + inspect(valueNode));
	}

	function ownKeys$1(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

	function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys$1(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys$1(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

	function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
	function isType(type) {
	  return isScalarType(type) || isObjectType(type) || isInterfaceType(type) || isUnionType(type) || isEnumType(type) || isInputObjectType(type) || isListType(type) || isNonNullType(type);
	}
	function assertType(type) {
	  if (!isType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL type."));
	  }

	  return type;
	}
	/**
	 * There are predicates for each kind of GraphQL type.
	 */

	// eslint-disable-next-line no-redeclare
	function isScalarType(type) {
	  return instanceOf(type, GraphQLScalarType);
	}
	function assertScalarType(type) {
	  if (!isScalarType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL Scalar type."));
	  }

	  return type;
	}
	// eslint-disable-next-line no-redeclare
	function isObjectType(type) {
	  return instanceOf(type, GraphQLObjectType);
	}
	function assertObjectType(type) {
	  if (!isObjectType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL Object type."));
	  }

	  return type;
	}
	// eslint-disable-next-line no-redeclare
	function isInterfaceType(type) {
	  return instanceOf(type, GraphQLInterfaceType);
	}
	function assertInterfaceType(type) {
	  if (!isInterfaceType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL Interface type."));
	  }

	  return type;
	}
	// eslint-disable-next-line no-redeclare
	function isUnionType(type) {
	  return instanceOf(type, GraphQLUnionType);
	}
	function assertUnionType(type) {
	  if (!isUnionType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL Union type."));
	  }

	  return type;
	}
	// eslint-disable-next-line no-redeclare
	function isEnumType(type) {
	  return instanceOf(type, GraphQLEnumType);
	}
	function assertEnumType(type) {
	  if (!isEnumType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL Enum type."));
	  }

	  return type;
	}
	// eslint-disable-next-line no-redeclare
	function isInputObjectType(type) {
	  return instanceOf(type, GraphQLInputObjectType);
	}
	function assertInputObjectType(type) {
	  if (!isInputObjectType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL Input Object type."));
	  }

	  return type;
	}
	// eslint-disable-next-line no-redeclare
	function isListType(type) {
	  return instanceOf(type, GraphQLList);
	}
	function assertListType(type) {
	  if (!isListType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL List type."));
	  }

	  return type;
	}
	// eslint-disable-next-line no-redeclare
	function isNonNullType(type) {
	  return instanceOf(type, GraphQLNonNull);
	}
	function assertNonNullType(type) {
	  if (!isNonNullType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL Non-Null type."));
	  }

	  return type;
	}
	/**
	 * These types may be used as input types for arguments and directives.
	 */

	function isInputType(type) {
	  return isScalarType(type) || isEnumType(type) || isInputObjectType(type) || isWrappingType(type) && isInputType(type.ofType);
	}
	function assertInputType(type) {
	  if (!isInputType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL input type."));
	  }

	  return type;
	}
	/**
	 * These types may be used as output types as the result of fields.
	 */

	function isOutputType(type) {
	  return isScalarType(type) || isObjectType(type) || isInterfaceType(type) || isUnionType(type) || isEnumType(type) || isWrappingType(type) && isOutputType(type.ofType);
	}
	function assertOutputType(type) {
	  if (!isOutputType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL output type."));
	  }

	  return type;
	}
	/**
	 * These types may describe types which may be leaf values.
	 */

	function isLeafType(type) {
	  return isScalarType(type) || isEnumType(type);
	}
	function assertLeafType(type) {
	  if (!isLeafType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL leaf type."));
	  }

	  return type;
	}
	/**
	 * These types may describe the parent context of a selection set.
	 */

	function isCompositeType(type) {
	  return isObjectType(type) || isInterfaceType(type) || isUnionType(type);
	}
	function assertCompositeType(type) {
	  if (!isCompositeType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL composite type."));
	  }

	  return type;
	}
	/**
	 * These types may describe the parent context of a selection set.
	 */

	function isAbstractType(type) {
	  return isInterfaceType(type) || isUnionType(type);
	}
	function assertAbstractType(type) {
	  if (!isAbstractType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL abstract type."));
	  }

	  return type;
	}
	/**
	 * List Type Wrapper
	 *
	 * A list is a wrapping type which points to another type.
	 * Lists are often created within the context of defining the fields of
	 * an object type.
	 *
	 * Example:
	 *
	 *     const PersonType = new GraphQLObjectType({
	 *       name: 'Person',
	 *       fields: () => ({
	 *         parents: { type: GraphQLList(PersonType) },
	 *         children: { type: GraphQLList(PersonType) },
	 *       })
	 *     })
	 *
	 */

	// eslint-disable-next-line no-redeclare
	function GraphQLList(ofType) {
	  if (this instanceof GraphQLList) {
	    this.ofType = assertType(ofType);
	  } else {
	    return new GraphQLList(ofType);
	  }
	} // Need to cast through any to alter the prototype.

	GraphQLList.prototype.toString = function toString() {
	  return '[' + String(this.ofType) + ']';
	}; // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported


	defineToStringTag(GraphQLList);
	defineToJSON(GraphQLList);
	/**
	 * Non-Null Type Wrapper
	 *
	 * A non-null is a wrapping type which points to another type.
	 * Non-null types enforce that their values are never null and can ensure
	 * an error is raised if this ever occurs during a request. It is useful for
	 * fields which you can make a strong guarantee on non-nullability, for example
	 * usually the id field of a database row will never be null.
	 *
	 * Example:
	 *
	 *     const RowType = new GraphQLObjectType({
	 *       name: 'Row',
	 *       fields: () => ({
	 *         id: { type: GraphQLNonNull(GraphQLString) },
	 *       })
	 *     })
	 *
	 * Note: the enforcement of non-nullability occurs within the executor.
	 */

	// eslint-disable-next-line no-redeclare
	function GraphQLNonNull(ofType) {
	  if (this instanceof GraphQLNonNull) {
	    this.ofType = assertNullableType(ofType);
	  } else {
	    return new GraphQLNonNull(ofType);
	  }
	} // Need to cast through any to alter the prototype.

	GraphQLNonNull.prototype.toString = function toString() {
	  return String(this.ofType) + '!';
	}; // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported


	defineToStringTag(GraphQLNonNull);
	defineToJSON(GraphQLNonNull);
	/**
	 * These types wrap and modify other types
	 */

	function isWrappingType(type) {
	  return isListType(type) || isNonNullType(type);
	}
	function assertWrappingType(type) {
	  if (!isWrappingType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL wrapping type."));
	  }

	  return type;
	}
	/**
	 * These types can all accept null as a value.
	 */

	function isNullableType(type) {
	  return isType(type) && !isNonNullType(type);
	}
	function assertNullableType(type) {
	  if (!isNullableType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL nullable type."));
	  }

	  return type;
	}
	/* eslint-disable no-redeclare */

	function getNullableType(type) {
	  /* eslint-enable no-redeclare */
	  if (type) {
	    return isNonNullType(type) ? type.ofType : type;
	  }
	}
	/**
	 * These named types do not include modifiers like List or NonNull.
	 */

	function isNamedType(type) {
	  return isScalarType(type) || isObjectType(type) || isInterfaceType(type) || isUnionType(type) || isEnumType(type) || isInputObjectType(type);
	}
	function assertNamedType(type) {
	  if (!isNamedType(type)) {
	    throw new Error("Expected ".concat(inspect(type), " to be a GraphQL named type."));
	  }

	  return type;
	}
	/* eslint-disable no-redeclare */

	function getNamedType(type) {
	  /* eslint-enable no-redeclare */
	  if (type) {
	    var unwrappedType = type;

	    while (isWrappingType(unwrappedType)) {
	      unwrappedType = unwrappedType.ofType;
	    }

	    return unwrappedType;
	  }
	}
	/**
	 * Used while defining GraphQL types to allow for circular references in
	 * otherwise immutable type definitions.
	 */

	function resolveThunk(thunk) {
	  // $FlowFixMe(>=0.90.0)
	  return typeof thunk === 'function' ? thunk() : thunk;
	}

	function undefineIfEmpty(arr) {
	  return arr && arr.length > 0 ? arr : undefined;
	}
	/**
	 * Scalar Type Definition
	 *
	 * The leaf values of any request and input values to arguments are
	 * Scalars (or Enums) and are defined with a name and a series of functions
	 * used to parse input from ast or variables and to ensure validity.
	 *
	 * If a type's serialize function does not return a value (i.e. it returns
	 * `undefined`) then an error will be raised and a `null` value will be returned
	 * in the response. If the serialize function returns `null`, then no error will
	 * be included in the response.
	 *
	 * Example:
	 *
	 *     const OddType = new GraphQLScalarType({
	 *       name: 'Odd',
	 *       serialize(value) {
	 *         if (value % 2 === 1) {
	 *           return value;
	 *         }
	 *       }
	 *     });
	 *
	 */


	var GraphQLScalarType =
	/*#__PURE__*/
	function () {
	  function GraphQLScalarType(config) {
	    var parseValue = config.parseValue || identityFunc;
	    this.name = config.name;
	    this.description = config.description;
	    this.serialize = config.serialize || identityFunc;
	    this.parseValue = parseValue;

	    this.parseLiteral = config.parseLiteral || function (node) {
	      return parseValue(valueFromASTUntyped(node));
	    };

	    this.extensions = config.extensions && toObjMap(config.extensions);
	    this.astNode = config.astNode;
	    this.extensionASTNodes = undefineIfEmpty(config.extensionASTNodes);
	    typeof config.name === 'string' || devAssert(0, 'Must provide name.');
	    config.serialize == null || typeof config.serialize === 'function' || devAssert(0, "".concat(this.name, " must provide \"serialize\" function. If this custom Scalar is also used as an input type, ensure \"parseValue\" and \"parseLiteral\" functions are also provided."));

	    if (config.parseLiteral) {
	      typeof config.parseValue === 'function' && typeof config.parseLiteral === 'function' || devAssert(0, "".concat(this.name, " must provide both \"parseValue\" and \"parseLiteral\" functions."));
	    }
	  }

	  var _proto = GraphQLScalarType.prototype;

	  _proto.toConfig = function toConfig() {
	    return {
	      name: this.name,
	      description: this.description,
	      serialize: this.serialize,
	      parseValue: this.parseValue,
	      parseLiteral: this.parseLiteral,
	      extensions: this.extensions,
	      astNode: this.astNode,
	      extensionASTNodes: this.extensionASTNodes || []
	    };
	  };

	  _proto.toString = function toString() {
	    return this.name;
	  };

	  return GraphQLScalarType;
	}(); // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(GraphQLScalarType);
	defineToJSON(GraphQLScalarType);

	/**
	 * Object Type Definition
	 *
	 * Almost all of the GraphQL types you define will be object types. Object types
	 * have a name, but most importantly describe their fields.
	 *
	 * Example:
	 *
	 *     const AddressType = new GraphQLObjectType({
	 *       name: 'Address',
	 *       fields: {
	 *         street: { type: GraphQLString },
	 *         number: { type: GraphQLInt },
	 *         formatted: {
	 *           type: GraphQLString,
	 *           resolve(obj) {
	 *             return obj.number + ' ' + obj.street
	 *           }
	 *         }
	 *       }
	 *     });
	 *
	 * When two types need to refer to each other, or a type needs to refer to
	 * itself in a field, you can use a function expression (aka a closure or a
	 * thunk) to supply the fields lazily.
	 *
	 * Example:
	 *
	 *     const PersonType = new GraphQLObjectType({
	 *       name: 'Person',
	 *       fields: () => ({
	 *         name: { type: GraphQLString },
	 *         bestFriend: { type: PersonType },
	 *       })
	 *     });
	 *
	 */
	var GraphQLObjectType =
	/*#__PURE__*/
	function () {
	  function GraphQLObjectType(config) {
	    this.name = config.name;
	    this.description = config.description;
	    this.isTypeOf = config.isTypeOf;
	    this.extensions = config.extensions && toObjMap(config.extensions);
	    this.astNode = config.astNode;
	    this.extensionASTNodes = undefineIfEmpty(config.extensionASTNodes);
	    this._fields = defineFieldMap.bind(undefined, config);
	    this._interfaces = defineInterfaces.bind(undefined, config);
	    typeof config.name === 'string' || devAssert(0, 'Must provide name.');
	    config.isTypeOf == null || typeof config.isTypeOf === 'function' || devAssert(0, "".concat(this.name, " must provide \"isTypeOf\" as a function, ") + "but got: ".concat(inspect(config.isTypeOf), "."));
	  }

	  var _proto2 = GraphQLObjectType.prototype;

	  _proto2.getFields = function getFields() {
	    if (typeof this._fields === 'function') {
	      this._fields = this._fields();
	    }

	    return this._fields;
	  };

	  _proto2.getInterfaces = function getInterfaces() {
	    if (typeof this._interfaces === 'function') {
	      this._interfaces = this._interfaces();
	    }

	    return this._interfaces;
	  };

	  _proto2.toConfig = function toConfig() {
	    return {
	      name: this.name,
	      description: this.description,
	      interfaces: this.getInterfaces(),
	      fields: fieldsToFieldsConfig(this.getFields()),
	      isTypeOf: this.isTypeOf,
	      extensions: this.extensions,
	      astNode: this.astNode,
	      extensionASTNodes: this.extensionASTNodes || []
	    };
	  };

	  _proto2.toString = function toString() {
	    return this.name;
	  };

	  return GraphQLObjectType;
	}(); // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(GraphQLObjectType);
	defineToJSON(GraphQLObjectType);

	function defineInterfaces(config) {
	  var interfaces = resolveThunk(config.interfaces) || [];
	  Array.isArray(interfaces) || devAssert(0, "".concat(config.name, " interfaces must be an Array or a function which returns an Array."));
	  return interfaces;
	}

	function defineFieldMap(config) {
	  var fieldMap = resolveThunk(config.fields) || {};
	  isPlainObj(fieldMap) || devAssert(0, "".concat(config.name, " fields must be an object with field names as keys or a function which returns such an object."));
	  return mapValue(fieldMap, function (fieldConfig, fieldName) {
	    isPlainObj(fieldConfig) || devAssert(0, "".concat(config.name, ".").concat(fieldName, " field config must be an object"));
	    !('isDeprecated' in fieldConfig) || devAssert(0, "".concat(config.name, ".").concat(fieldName, " should provide \"deprecationReason\" instead of \"isDeprecated\"."));
	    fieldConfig.resolve == null || typeof fieldConfig.resolve === 'function' || devAssert(0, "".concat(config.name, ".").concat(fieldName, " field resolver must be a function if ") + "provided, but got: ".concat(inspect(fieldConfig.resolve), "."));
	    var argsConfig = fieldConfig.args || {};
	    isPlainObj(argsConfig) || devAssert(0, "".concat(config.name, ".").concat(fieldName, " args must be an object with argument names as keys."));
	    var args = objectEntries(argsConfig).map(function (_ref) {
	      var argName = _ref[0],
	          arg = _ref[1];
	      return {
	        name: argName,
	        description: arg.description === undefined ? null : arg.description,
	        type: arg.type,
	        defaultValue: arg.defaultValue,
	        extensions: arg.extensions && toObjMap(arg.extensions),
	        astNode: arg.astNode
	      };
	    });
	    return _objectSpread({}, fieldConfig, {
	      name: fieldName,
	      description: fieldConfig.description,
	      type: fieldConfig.type,
	      args: args,
	      resolve: fieldConfig.resolve,
	      subscribe: fieldConfig.subscribe,
	      isDeprecated: Boolean(fieldConfig.deprecationReason),
	      deprecationReason: fieldConfig.deprecationReason,
	      extensions: fieldConfig.extensions && toObjMap(fieldConfig.extensions),
	      astNode: fieldConfig.astNode
	    });
	  });
	}

	function isPlainObj(obj) {
	  return isObjectLike(obj) && !Array.isArray(obj);
	}

	function fieldsToFieldsConfig(fields) {
	  return mapValue(fields, function (field) {
	    return {
	      description: field.description,
	      type: field.type,
	      args: argsToArgsConfig(field.args),
	      resolve: field.resolve,
	      subscribe: field.subscribe,
	      deprecationReason: field.deprecationReason,
	      extensions: field.extensions,
	      astNode: field.astNode
	    };
	  });
	}

	function argsToArgsConfig(args) {
	  return keyValMap(args, function (arg) {
	    return arg.name;
	  }, function (arg) {
	    return {
	      description: arg.description,
	      type: arg.type,
	      defaultValue: arg.defaultValue,
	      extensions: arg.extensions,
	      astNode: arg.astNode
	    };
	  });
	}
	function isRequiredArgument(arg) {
	  return isNonNullType(arg.type) && arg.defaultValue === undefined;
	}

	/**
	 * Interface Type Definition
	 *
	 * When a field can return one of a heterogeneous set of types, a Interface type
	 * is used to describe what types are possible, what fields are in common across
	 * all types, as well as a function to determine which type is actually used
	 * when the field is resolved.
	 *
	 * Example:
	 *
	 *     const EntityType = new GraphQLInterfaceType({
	 *       name: 'Entity',
	 *       fields: {
	 *         name: { type: GraphQLString }
	 *       }
	 *     });
	 *
	 */
	var GraphQLInterfaceType =
	/*#__PURE__*/
	function () {
	  function GraphQLInterfaceType(config) {
	    this.name = config.name;
	    this.description = config.description;
	    this.resolveType = config.resolveType;
	    this.extensions = config.extensions && toObjMap(config.extensions);
	    this.astNode = config.astNode;
	    this.extensionASTNodes = undefineIfEmpty(config.extensionASTNodes);
	    this._fields = defineFieldMap.bind(undefined, config);
	    typeof config.name === 'string' || devAssert(0, 'Must provide name.');
	    config.resolveType == null || typeof config.resolveType === 'function' || devAssert(0, "".concat(this.name, " must provide \"resolveType\" as a function, ") + "but got: ".concat(inspect(config.resolveType), "."));
	  }

	  var _proto3 = GraphQLInterfaceType.prototype;

	  _proto3.getFields = function getFields() {
	    if (typeof this._fields === 'function') {
	      this._fields = this._fields();
	    }

	    return this._fields;
	  };

	  _proto3.toConfig = function toConfig() {
	    return {
	      name: this.name,
	      description: this.description,
	      fields: fieldsToFieldsConfig(this.getFields()),
	      resolveType: this.resolveType,
	      extensions: this.extensions,
	      astNode: this.astNode,
	      extensionASTNodes: this.extensionASTNodes || []
	    };
	  };

	  _proto3.toString = function toString() {
	    return this.name;
	  };

	  return GraphQLInterfaceType;
	}(); // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(GraphQLInterfaceType);
	defineToJSON(GraphQLInterfaceType);

	/**
	 * Union Type Definition
	 *
	 * When a field can return one of a heterogeneous set of types, a Union type
	 * is used to describe what types are possible as well as providing a function
	 * to determine which type is actually used when the field is resolved.
	 *
	 * Example:
	 *
	 *     const PetType = new GraphQLUnionType({
	 *       name: 'Pet',
	 *       types: [ DogType, CatType ],
	 *       resolveType(value) {
	 *         if (value instanceof Dog) {
	 *           return DogType;
	 *         }
	 *         if (value instanceof Cat) {
	 *           return CatType;
	 *         }
	 *       }
	 *     });
	 *
	 */
	var GraphQLUnionType =
	/*#__PURE__*/
	function () {
	  function GraphQLUnionType(config) {
	    this.name = config.name;
	    this.description = config.description;
	    this.resolveType = config.resolveType;
	    this.extensions = config.extensions && toObjMap(config.extensions);
	    this.astNode = config.astNode;
	    this.extensionASTNodes = undefineIfEmpty(config.extensionASTNodes);
	    this._types = defineTypes.bind(undefined, config);
	    typeof config.name === 'string' || devAssert(0, 'Must provide name.');
	    config.resolveType == null || typeof config.resolveType === 'function' || devAssert(0, "".concat(this.name, " must provide \"resolveType\" as a function, ") + "but got: ".concat(inspect(config.resolveType), "."));
	  }

	  var _proto4 = GraphQLUnionType.prototype;

	  _proto4.getTypes = function getTypes() {
	    if (typeof this._types === 'function') {
	      this._types = this._types();
	    }

	    return this._types;
	  };

	  _proto4.toConfig = function toConfig() {
	    return {
	      name: this.name,
	      description: this.description,
	      types: this.getTypes(),
	      resolveType: this.resolveType,
	      extensions: this.extensions,
	      astNode: this.astNode,
	      extensionASTNodes: this.extensionASTNodes || []
	    };
	  };

	  _proto4.toString = function toString() {
	    return this.name;
	  };

	  return GraphQLUnionType;
	}(); // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(GraphQLUnionType);
	defineToJSON(GraphQLUnionType);

	function defineTypes(config) {
	  var types = resolveThunk(config.types) || [];
	  Array.isArray(types) || devAssert(0, "Must provide Array of types or a function which returns such an array for Union ".concat(config.name, "."));
	  return types;
	}

	/**
	 * Enum Type Definition
	 *
	 * Some leaf values of requests and input values are Enums. GraphQL serializes
	 * Enum values as strings, however internally Enums can be represented by any
	 * kind of type, often integers.
	 *
	 * Example:
	 *
	 *     const RGBType = new GraphQLEnumType({
	 *       name: 'RGB',
	 *       values: {
	 *         RED: { value: 0 },
	 *         GREEN: { value: 1 },
	 *         BLUE: { value: 2 }
	 *       }
	 *     });
	 *
	 * Note: If a value is not provided in a definition, the name of the enum value
	 * will be used as its internal value.
	 */
	var GraphQLEnumType
	/* <T> */
	=
	/*#__PURE__*/
	function () {
	  function GraphQLEnumType(config) {
	    this.name = config.name;
	    this.description = config.description;
	    this.extensions = config.extensions && toObjMap(config.extensions);
	    this.astNode = config.astNode;
	    this.extensionASTNodes = undefineIfEmpty(config.extensionASTNodes);
	    this._values = defineEnumValues(this.name, config.values);
	    this._valueLookup = new Map(this._values.map(function (enumValue) {
	      return [enumValue.value, enumValue];
	    }));
	    this._nameLookup = keyMap(this._values, function (value) {
	      return value.name;
	    });
	    typeof config.name === 'string' || devAssert(0, 'Must provide name.');
	  }

	  var _proto5 = GraphQLEnumType.prototype;

	  _proto5.getValues = function getValues() {
	    return this._values;
	  };

	  _proto5.getValue = function getValue(name) {
	    return this._nameLookup[name];
	  };

	  _proto5.serialize = function serialize(value) {
	    var enumValue = this._valueLookup.get(value);

	    if (enumValue) {
	      return enumValue.name;
	    }
	  };

	  _proto5.parseValue = function parseValue(value)
	  /* T */
	  {
	    if (typeof value === 'string') {
	      var enumValue = this.getValue(value);

	      if (enumValue) {
	        return enumValue.value;
	      }
	    }
	  };

	  _proto5.parseLiteral = function parseLiteral(valueNode, _variables)
	  /* T */
	  {
	    // Note: variables will be resolved to a value before calling this function.
	    if (valueNode.kind === Kind.ENUM) {
	      var enumValue = this.getValue(valueNode.value);

	      if (enumValue) {
	        return enumValue.value;
	      }
	    }
	  };

	  _proto5.toConfig = function toConfig() {
	    var values = keyValMap(this.getValues(), function (value) {
	      return value.name;
	    }, function (value) {
	      return {
	        description: value.description,
	        value: value.value,
	        deprecationReason: value.deprecationReason,
	        extensions: value.extensions,
	        astNode: value.astNode
	      };
	    });
	    return {
	      name: this.name,
	      description: this.description,
	      values: values,
	      extensions: this.extensions,
	      astNode: this.astNode,
	      extensionASTNodes: this.extensionASTNodes || []
	    };
	  };

	  _proto5.toString = function toString() {
	    return this.name;
	  };

	  return GraphQLEnumType;
	}(); // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(GraphQLEnumType);
	defineToJSON(GraphQLEnumType);

	function defineEnumValues(typeName, valueMap) {
	  isPlainObj(valueMap) || devAssert(0, "".concat(typeName, " values must be an object with value names as keys."));
	  return objectEntries(valueMap).map(function (_ref2) {
	    var valueName = _ref2[0],
	        value = _ref2[1];
	    isPlainObj(value) || devAssert(0, "".concat(typeName, ".").concat(valueName, " must refer to an object with a \"value\" key ") + "representing an internal value but got: ".concat(inspect(value), "."));
	    !('isDeprecated' in value) || devAssert(0, "".concat(typeName, ".").concat(valueName, " should provide \"deprecationReason\" instead of \"isDeprecated\"."));
	    return {
	      name: valueName,
	      description: value.description,
	      value: 'value' in value ? value.value : valueName,
	      isDeprecated: Boolean(value.deprecationReason),
	      deprecationReason: value.deprecationReason,
	      extensions: value.extensions && toObjMap(value.extensions),
	      astNode: value.astNode
	    };
	  });
	}

	/**
	 * Input Object Type Definition
	 *
	 * An input object defines a structured collection of fields which may be
	 * supplied to a field argument.
	 *
	 * Using `NonNull` will ensure that a value must be provided by the query
	 *
	 * Example:
	 *
	 *     const GeoPoint = new GraphQLInputObjectType({
	 *       name: 'GeoPoint',
	 *       fields: {
	 *         lat: { type: GraphQLNonNull(GraphQLFloat) },
	 *         lon: { type: GraphQLNonNull(GraphQLFloat) },
	 *         alt: { type: GraphQLFloat, defaultValue: 0 },
	 *       }
	 *     });
	 *
	 */
	var GraphQLInputObjectType =
	/*#__PURE__*/
	function () {
	  function GraphQLInputObjectType(config) {
	    this.name = config.name;
	    this.description = config.description;
	    this.extensions = config.extensions && toObjMap(config.extensions);
	    this.astNode = config.astNode;
	    this.extensionASTNodes = undefineIfEmpty(config.extensionASTNodes);
	    this._fields = defineInputFieldMap.bind(undefined, config);
	    typeof config.name === 'string' || devAssert(0, 'Must provide name.');
	  }

	  var _proto6 = GraphQLInputObjectType.prototype;

	  _proto6.getFields = function getFields() {
	    if (typeof this._fields === 'function') {
	      this._fields = this._fields();
	    }

	    return this._fields;
	  };

	  _proto6.toConfig = function toConfig() {
	    var fields = mapValue(this.getFields(), function (field) {
	      return {
	        description: field.description,
	        type: field.type,
	        defaultValue: field.defaultValue,
	        extensions: field.extensions,
	        astNode: field.astNode
	      };
	    });
	    return {
	      name: this.name,
	      description: this.description,
	      fields: fields,
	      extensions: this.extensions,
	      astNode: this.astNode,
	      extensionASTNodes: this.extensionASTNodes || []
	    };
	  };

	  _proto6.toString = function toString() {
	    return this.name;
	  };

	  return GraphQLInputObjectType;
	}(); // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(GraphQLInputObjectType);
	defineToJSON(GraphQLInputObjectType);

	function defineInputFieldMap(config) {
	  var fieldMap = resolveThunk(config.fields) || {};
	  isPlainObj(fieldMap) || devAssert(0, "".concat(config.name, " fields must be an object with field names as keys or a function which returns such an object."));
	  return mapValue(fieldMap, function (fieldConfig, fieldName) {
	    !('resolve' in fieldConfig) || devAssert(0, "".concat(config.name, ".").concat(fieldName, " field has a resolve property, but Input Types cannot define resolvers."));
	    return _objectSpread({}, fieldConfig, {
	      name: fieldName,
	      description: fieldConfig.description,
	      type: fieldConfig.type,
	      defaultValue: fieldConfig.defaultValue,
	      extensions: fieldConfig.extensions && toObjMap(fieldConfig.extensions),
	      astNode: fieldConfig.astNode
	    });
	  });
	}

	function isRequiredInputField(field) {
	  return isNonNullType(field.type) && field.defaultValue === undefined;
	}

	/**
	 * Provided two types, return true if the types are equal (invariant).
	 */

	function isEqualType(typeA, typeB) {
	  // Equivalent types are equal.
	  if (typeA === typeB) {
	    return true;
	  } // If either type is non-null, the other must also be non-null.


	  if (isNonNullType(typeA) && isNonNullType(typeB)) {
	    return isEqualType(typeA.ofType, typeB.ofType);
	  } // If either type is a list, the other must also be a list.


	  if (isListType(typeA) && isListType(typeB)) {
	    return isEqualType(typeA.ofType, typeB.ofType);
	  } // Otherwise the types are not equal.


	  return false;
	}
	/**
	 * Provided a type and a super type, return true if the first type is either
	 * equal or a subset of the second super type (covariant).
	 */

	function isTypeSubTypeOf(schema, maybeSubType, superType) {
	  // Equivalent type is a valid subtype
	  if (maybeSubType === superType) {
	    return true;
	  } // If superType is non-null, maybeSubType must also be non-null.


	  if (isNonNullType(superType)) {
	    if (isNonNullType(maybeSubType)) {
	      return isTypeSubTypeOf(schema, maybeSubType.ofType, superType.ofType);
	    }

	    return false;
	  }

	  if (isNonNullType(maybeSubType)) {
	    // If superType is nullable, maybeSubType may be non-null or nullable.
	    return isTypeSubTypeOf(schema, maybeSubType.ofType, superType);
	  } // If superType type is a list, maybeSubType type must also be a list.


	  if (isListType(superType)) {
	    if (isListType(maybeSubType)) {
	      return isTypeSubTypeOf(schema, maybeSubType.ofType, superType.ofType);
	    }

	    return false;
	  }

	  if (isListType(maybeSubType)) {
	    // If superType is not a list, maybeSubType must also be not a list.
	    return false;
	  } // If superType type is an abstract type, maybeSubType type may be a currently
	  // possible object type.


	  if (isAbstractType(superType) && isObjectType(maybeSubType) && schema.isPossibleType(superType, maybeSubType)) {
	    return true;
	  } // Otherwise, the child type is not a valid subtype of the parent type.


	  return false;
	}
	/**
	 * Provided two composite types, determine if they "overlap". Two composite
	 * types overlap when the Sets of possible concrete types for each intersect.
	 *
	 * This is often used to determine if a fragment of a given type could possibly
	 * be visited in a context of another type.
	 *
	 * This function is commutative.
	 */

	function doTypesOverlap(schema, typeA, typeB) {
	  // Equivalent types overlap
	  if (typeA === typeB) {
	    return true;
	  }

	  if (isAbstractType(typeA)) {
	    if (isAbstractType(typeB)) {
	      // If both types are abstract, then determine if there is any intersection
	      // between possible concrete types of each.
	      return schema.getPossibleTypes(typeA).some(function (type) {
	        return schema.isPossibleType(typeB, type);
	      });
	    } // Determine if the latter type is a possible concrete type of the former.


	    return schema.isPossibleType(typeA, typeB);
	  }

	  if (isAbstractType(typeB)) {
	    // Determine if the former type is a possible concrete type of the latter.
	    return schema.isPossibleType(typeB, typeA);
	  } // Otherwise the types do not overlap.


	  return false;
	}

	/* eslint-disable no-redeclare */
	// $FlowFixMe workaround for: https://github.com/facebook/flow/issues/4441
	var isFinitePolyfill = Number.isFinite || function (value) {
	  return typeof value === 'number' && isFinite(value);
	};

	/* eslint-disable no-redeclare */
	// $FlowFixMe workaround for: https://github.com/facebook/flow/issues/4441
	var isInteger = Number.isInteger || function (value) {
	  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
	};

	// 32-bit signed integer, providing the broadest support across platforms.
	//
	// n.b. JavaScript's integers are safe between -(2^53 - 1) and 2^53 - 1 because
	// they are internally represented as IEEE 754 doubles.

	var MAX_INT = 2147483647;
	var MIN_INT = -2147483648;

	function serializeInt(value) {
	  if (typeof value === 'boolean') {
	    return value ? 1 : 0;
	  }

	  var num = value;

	  if (typeof value === 'string' && value !== '') {
	    num = Number(value);
	  }

	  if (!isInteger(num)) {
	    throw new TypeError("Int cannot represent non-integer value: ".concat(inspect(value)));
	  }

	  if (num > MAX_INT || num < MIN_INT) {
	    throw new TypeError("Int cannot represent non 32-bit signed integer value: ".concat(inspect(value)));
	  }

	  return num;
	}

	function coerceInt(value) {
	  if (!isInteger(value)) {
	    throw new TypeError("Int cannot represent non-integer value: ".concat(inspect(value)));
	  }

	  if (value > MAX_INT || value < MIN_INT) {
	    throw new TypeError("Int cannot represent non 32-bit signed integer value: ".concat(inspect(value)));
	  }

	  return value;
	}

	var GraphQLInt = new GraphQLScalarType({
	  name: 'Int',
	  description: 'The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1.',
	  serialize: serializeInt,
	  parseValue: coerceInt,
	  parseLiteral: function parseLiteral(ast) {
	    if (ast.kind === Kind.INT) {
	      var num = parseInt(ast.value, 10);

	      if (num <= MAX_INT && num >= MIN_INT) {
	        return num;
	      }
	    }

	    return undefined;
	  }
	});

	function serializeFloat(value) {
	  if (typeof value === 'boolean') {
	    return value ? 1 : 0;
	  }

	  var num = value;

	  if (typeof value === 'string' && value !== '') {
	    num = Number(value);
	  }

	  if (!isFinitePolyfill(num)) {
	    throw new TypeError("Float cannot represent non numeric value: ".concat(inspect(value)));
	  }

	  return num;
	}

	function coerceFloat(value) {
	  if (!isFinitePolyfill(value)) {
	    throw new TypeError("Float cannot represent non numeric value: ".concat(inspect(value)));
	  }

	  return value;
	}

	var GraphQLFloat = new GraphQLScalarType({
	  name: 'Float',
	  description: 'The `Float` scalar type represents signed double-precision fractional values as specified by [IEEE 754](https://en.wikipedia.org/wiki/IEEE_floating_point).',
	  serialize: serializeFloat,
	  parseValue: coerceFloat,
	  parseLiteral: function parseLiteral(ast) {
	    return ast.kind === Kind.FLOAT || ast.kind === Kind.INT ? parseFloat(ast.value) : undefined;
	  }
	}); // Support serializing objects with custom valueOf() or toJSON() functions -
	// a common way to represent a complex value which can be represented as
	// a string (ex: MongoDB id objects).

	function serializeObject(value) {
	  if (isObjectLike(value)) {
	    if (typeof value.valueOf === 'function') {
	      var valueOfResult = value.valueOf();

	      if (!isObjectLike(valueOfResult)) {
	        return valueOfResult;
	      }
	    }

	    if (typeof value.toJSON === 'function') {
	      // $FlowFixMe(>=0.90.0)
	      return value.toJSON();
	    }
	  }

	  return value;
	}

	function serializeString(rawValue) {
	  var value = serializeObject(rawValue); // Serialize string, boolean and number values to a string, but do not
	  // attempt to coerce object, function, symbol, or other types as strings.

	  if (typeof value === 'string') {
	    return value;
	  }

	  if (typeof value === 'boolean') {
	    return value ? 'true' : 'false';
	  }

	  if (isFinitePolyfill(value)) {
	    return value.toString();
	  }

	  throw new TypeError("String cannot represent value: ".concat(inspect(rawValue)));
	}

	function coerceString(value) {
	  if (typeof value !== 'string') {
	    throw new TypeError("String cannot represent a non string value: ".concat(inspect(value)));
	  }

	  return value;
	}

	var GraphQLString = new GraphQLScalarType({
	  name: 'String',
	  description: 'The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most often used by GraphQL to represent free-form human-readable text.',
	  serialize: serializeString,
	  parseValue: coerceString,
	  parseLiteral: function parseLiteral(ast) {
	    return ast.kind === Kind.STRING ? ast.value : undefined;
	  }
	});

	function serializeBoolean(value) {
	  if (typeof value === 'boolean') {
	    return value;
	  }

	  if (isFinitePolyfill(value)) {
	    return value !== 0;
	  }

	  throw new TypeError("Boolean cannot represent a non boolean value: ".concat(inspect(value)));
	}

	function coerceBoolean(value) {
	  if (typeof value !== 'boolean') {
	    throw new TypeError("Boolean cannot represent a non boolean value: ".concat(inspect(value)));
	  }

	  return value;
	}

	var GraphQLBoolean = new GraphQLScalarType({
	  name: 'Boolean',
	  description: 'The `Boolean` scalar type represents `true` or `false`.',
	  serialize: serializeBoolean,
	  parseValue: coerceBoolean,
	  parseLiteral: function parseLiteral(ast) {
	    return ast.kind === Kind.BOOLEAN ? ast.value : undefined;
	  }
	});

	function serializeID(rawValue) {
	  var value = serializeObject(rawValue);

	  if (typeof value === 'string') {
	    return value;
	  }

	  if (isInteger(value)) {
	    return String(value);
	  }

	  throw new TypeError("ID cannot represent value: ".concat(inspect(rawValue)));
	}

	function coerceID(value) {
	  if (typeof value === 'string') {
	    return value;
	  }

	  if (isInteger(value)) {
	    return value.toString();
	  }

	  throw new TypeError("ID cannot represent value: ".concat(inspect(value)));
	}

	var GraphQLID = new GraphQLScalarType({
	  name: 'ID',
	  description: 'The `ID` scalar type represents a unique identifier, often used to refetch an object or as key for a cache. The ID type appears in a JSON response as a String; however, it is not intended to be human-readable. When expected as an input type, any string (such as `"4"`) or integer (such as `4`) input value will be accepted as an ID.',
	  serialize: serializeID,
	  parseValue: coerceID,
	  parseLiteral: function parseLiteral(ast) {
	    return ast.kind === Kind.STRING || ast.kind === Kind.INT ? ast.value : undefined;
	  }
	});
	var specifiedScalarTypes = Object.freeze([GraphQLString, GraphQLInt, GraphQLFloat, GraphQLBoolean, GraphQLID]);
	function isSpecifiedScalarType(type) {
	  return isScalarType(type) && specifiedScalarTypes.some(function (_ref) {
	    var name = _ref.name;
	    return type.name === name;
	  });
	}

	/**
	 * Test if the given value is a GraphQL directive.
	 */

	// eslint-disable-next-line no-redeclare
	function isDirective(directive) {
	  return instanceOf(directive, GraphQLDirective);
	}
	function assertDirective(directive) {
	  if (!isDirective(directive)) {
	    throw new Error("Expected ".concat(inspect(directive), " to be a GraphQL directive."));
	  }

	  return directive;
	}
	/**
	 * Directives are used by the GraphQL runtime as a way of modifying execution
	 * behavior. Type system creators will usually not create these directly.
	 */

	var GraphQLDirective =
	/*#__PURE__*/
	function () {
	  function GraphQLDirective(config) {
	    this.name = config.name;
	    this.description = config.description;
	    this.locations = config.locations;
	    this.isRepeatable = config.isRepeatable != null && config.isRepeatable;
	    this.extensions = config.extensions && toObjMap(config.extensions);
	    this.astNode = config.astNode;
	    config.name || devAssert(0, 'Directive must be named.');
	    Array.isArray(config.locations) || devAssert(0, "@".concat(config.name, " locations must be an Array."));
	    var args = config.args || {};
	    isObjectLike(args) && !Array.isArray(args) || devAssert(0, "@".concat(config.name, " args must be an object with argument names as keys."));
	    this.args = objectEntries(args).map(function (_ref) {
	      var argName = _ref[0],
	          arg = _ref[1];
	      return {
	        name: argName,
	        description: arg.description === undefined ? null : arg.description,
	        type: arg.type,
	        defaultValue: arg.defaultValue,
	        extensions: arg.extensions && toObjMap(arg.extensions),
	        astNode: arg.astNode
	      };
	    });
	  }

	  var _proto = GraphQLDirective.prototype;

	  _proto.toString = function toString() {
	    return '@' + this.name;
	  };

	  _proto.toConfig = function toConfig() {
	    return {
	      name: this.name,
	      description: this.description,
	      locations: this.locations,
	      args: argsToArgsConfig(this.args),
	      isRepeatable: this.isRepeatable,
	      extensions: this.extensions,
	      astNode: this.astNode
	    };
	  };

	  return GraphQLDirective;
	}(); // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(GraphQLDirective);
	defineToJSON(GraphQLDirective);

	/**
	 * Used to conditionally include fields or fragments.
	 */
	var GraphQLIncludeDirective = new GraphQLDirective({
	  name: 'include',
	  description: 'Directs the executor to include this field or fragment only when the `if` argument is true.',
	  locations: [DirectiveLocation.FIELD, DirectiveLocation.FRAGMENT_SPREAD, DirectiveLocation.INLINE_FRAGMENT],
	  args: {
	    if: {
	      type: GraphQLNonNull(GraphQLBoolean),
	      description: 'Included when true.'
	    }
	  }
	});
	/**
	 * Used to conditionally skip (exclude) fields or fragments.
	 */

	var GraphQLSkipDirective = new GraphQLDirective({
	  name: 'skip',
	  description: 'Directs the executor to skip this field or fragment when the `if` argument is true.',
	  locations: [DirectiveLocation.FIELD, DirectiveLocation.FRAGMENT_SPREAD, DirectiveLocation.INLINE_FRAGMENT],
	  args: {
	    if: {
	      type: GraphQLNonNull(GraphQLBoolean),
	      description: 'Skipped when true.'
	    }
	  }
	});
	/**
	 * Constant string used for default reason for a deprecation.
	 */

	var DEFAULT_DEPRECATION_REASON = 'No longer supported';
	/**
	 * Used to declare element of a GraphQL schema as deprecated.
	 */

	var GraphQLDeprecatedDirective = new GraphQLDirective({
	  name: 'deprecated',
	  description: 'Marks an element of a GraphQL schema as no longer supported.',
	  locations: [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.ENUM_VALUE],
	  args: {
	    reason: {
	      type: GraphQLString,
	      description: 'Explains why this element was deprecated, usually also including a suggestion for how to access supported similar data. Formatted using the Markdown syntax (as specified by [CommonMark](https://commonmark.org/).',
	      defaultValue: DEFAULT_DEPRECATION_REASON
	    }
	  }
	});
	/**
	 * The full list of specified directives.
	 */

	var specifiedDirectives = Object.freeze([GraphQLIncludeDirective, GraphQLSkipDirective, GraphQLDeprecatedDirective]);
	function isSpecifiedDirective(directive) {
	  return isDirective(directive) && specifiedDirectives.some(function (_ref2) {
	    var name = _ref2.name;
	    return name === directive.name;
	  });
	}

	/**
	 * Converts an AST into a string, using one set of reasonable
	 * formatting rules.
	 */

	function print(ast) {
	  return visit(ast, {
	    leave: printDocASTReducer
	  });
	} // TODO: provide better type coverage in future

	var printDocASTReducer = {
	  Name: function Name(node) {
	    return node.value;
	  },
	  Variable: function Variable(node) {
	    return '$' + node.name;
	  },
	  // Document
	  Document: function Document(node) {
	    return join(node.definitions, '\n\n') + '\n';
	  },
	  OperationDefinition: function OperationDefinition(node) {
	    var op = node.operation;
	    var name = node.name;
	    var varDefs = wrap('(', join(node.variableDefinitions, ', '), ')');
	    var directives = join(node.directives, ' ');
	    var selectionSet = node.selectionSet; // Anonymous queries with no directives or variable definitions can use
	    // the query short form.

	    return !name && !directives && !varDefs && op === 'query' ? selectionSet : join([op, join([name, varDefs]), directives, selectionSet], ' ');
	  },
	  VariableDefinition: function VariableDefinition(_ref) {
	    var variable = _ref.variable,
	        type = _ref.type,
	        defaultValue = _ref.defaultValue,
	        directives = _ref.directives;
	    return variable + ': ' + type + wrap(' = ', defaultValue) + wrap(' ', join(directives, ' '));
	  },
	  SelectionSet: function SelectionSet(_ref2) {
	    var selections = _ref2.selections;
	    return block(selections);
	  },
	  Field: function Field(_ref3) {
	    var alias = _ref3.alias,
	        name = _ref3.name,
	        args = _ref3.arguments,
	        directives = _ref3.directives,
	        selectionSet = _ref3.selectionSet;
	    return join([wrap('', alias, ': ') + name + wrap('(', join(args, ', '), ')'), join(directives, ' '), selectionSet], ' ');
	  },
	  Argument: function Argument(_ref4) {
	    var name = _ref4.name,
	        value = _ref4.value;
	    return name + ': ' + value;
	  },
	  // Fragments
	  FragmentSpread: function FragmentSpread(_ref5) {
	    var name = _ref5.name,
	        directives = _ref5.directives;
	    return '...' + name + wrap(' ', join(directives, ' '));
	  },
	  InlineFragment: function InlineFragment(_ref6) {
	    var typeCondition = _ref6.typeCondition,
	        directives = _ref6.directives,
	        selectionSet = _ref6.selectionSet;
	    return join(['...', wrap('on ', typeCondition), join(directives, ' '), selectionSet], ' ');
	  },
	  FragmentDefinition: function FragmentDefinition(_ref7) {
	    var name = _ref7.name,
	        typeCondition = _ref7.typeCondition,
	        variableDefinitions = _ref7.variableDefinitions,
	        directives = _ref7.directives,
	        selectionSet = _ref7.selectionSet;
	    return (// Note: fragment variable definitions are experimental and may be changed
	      // or removed in the future.
	      "fragment ".concat(name).concat(wrap('(', join(variableDefinitions, ', '), ')'), " ") + "on ".concat(typeCondition, " ").concat(wrap('', join(directives, ' '), ' ')) + selectionSet
	    );
	  },
	  // Value
	  IntValue: function IntValue(_ref8) {
	    var value = _ref8.value;
	    return value;
	  },
	  FloatValue: function FloatValue(_ref9) {
	    var value = _ref9.value;
	    return value;
	  },
	  StringValue: function StringValue(_ref10, key) {
	    var value = _ref10.value,
	        isBlockString = _ref10.block;
	    return isBlockString ? printBlockString(value, key === 'description' ? '' : '  ') : JSON.stringify(value);
	  },
	  BooleanValue: function BooleanValue(_ref11) {
	    var value = _ref11.value;
	    return value ? 'true' : 'false';
	  },
	  NullValue: function NullValue() {
	    return 'null';
	  },
	  EnumValue: function EnumValue(_ref12) {
	    var value = _ref12.value;
	    return value;
	  },
	  ListValue: function ListValue(_ref13) {
	    var values = _ref13.values;
	    return '[' + join(values, ', ') + ']';
	  },
	  ObjectValue: function ObjectValue(_ref14) {
	    var fields = _ref14.fields;
	    return '{' + join(fields, ', ') + '}';
	  },
	  ObjectField: function ObjectField(_ref15) {
	    var name = _ref15.name,
	        value = _ref15.value;
	    return name + ': ' + value;
	  },
	  // Directive
	  Directive: function Directive(_ref16) {
	    var name = _ref16.name,
	        args = _ref16.arguments;
	    return '@' + name + wrap('(', join(args, ', '), ')');
	  },
	  // Type
	  NamedType: function NamedType(_ref17) {
	    var name = _ref17.name;
	    return name;
	  },
	  ListType: function ListType(_ref18) {
	    var type = _ref18.type;
	    return '[' + type + ']';
	  },
	  NonNullType: function NonNullType(_ref19) {
	    var type = _ref19.type;
	    return type + '!';
	  },
	  // Type System Definitions
	  SchemaDefinition: function SchemaDefinition(_ref20) {
	    var directives = _ref20.directives,
	        operationTypes = _ref20.operationTypes;
	    return join(['schema', join(directives, ' '), block(operationTypes)], ' ');
	  },
	  OperationTypeDefinition: function OperationTypeDefinition(_ref21) {
	    var operation = _ref21.operation,
	        type = _ref21.type;
	    return operation + ': ' + type;
	  },
	  ScalarTypeDefinition: addDescription(function (_ref22) {
	    var name = _ref22.name,
	        directives = _ref22.directives;
	    return join(['scalar', name, join(directives, ' ')], ' ');
	  }),
	  ObjectTypeDefinition: addDescription(function (_ref23) {
	    var name = _ref23.name,
	        interfaces = _ref23.interfaces,
	        directives = _ref23.directives,
	        fields = _ref23.fields;
	    return join(['type', name, wrap('implements ', join(interfaces, ' & ')), join(directives, ' '), block(fields)], ' ');
	  }),
	  FieldDefinition: addDescription(function (_ref24) {
	    var name = _ref24.name,
	        args = _ref24.arguments,
	        type = _ref24.type,
	        directives = _ref24.directives;
	    return name + (hasMultilineItems(args) ? wrap('(\n', indent(join(args, '\n')), '\n)') : wrap('(', join(args, ', '), ')')) + ': ' + type + wrap(' ', join(directives, ' '));
	  }),
	  InputValueDefinition: addDescription(function (_ref25) {
	    var name = _ref25.name,
	        type = _ref25.type,
	        defaultValue = _ref25.defaultValue,
	        directives = _ref25.directives;
	    return join([name + ': ' + type, wrap('= ', defaultValue), join(directives, ' ')], ' ');
	  }),
	  InterfaceTypeDefinition: addDescription(function (_ref26) {
	    var name = _ref26.name,
	        directives = _ref26.directives,
	        fields = _ref26.fields;
	    return join(['interface', name, join(directives, ' '), block(fields)], ' ');
	  }),
	  UnionTypeDefinition: addDescription(function (_ref27) {
	    var name = _ref27.name,
	        directives = _ref27.directives,
	        types = _ref27.types;
	    return join(['union', name, join(directives, ' '), types && types.length !== 0 ? '= ' + join(types, ' | ') : ''], ' ');
	  }),
	  EnumTypeDefinition: addDescription(function (_ref28) {
	    var name = _ref28.name,
	        directives = _ref28.directives,
	        values = _ref28.values;
	    return join(['enum', name, join(directives, ' '), block(values)], ' ');
	  }),
	  EnumValueDefinition: addDescription(function (_ref29) {
	    var name = _ref29.name,
	        directives = _ref29.directives;
	    return join([name, join(directives, ' ')], ' ');
	  }),
	  InputObjectTypeDefinition: addDescription(function (_ref30) {
	    var name = _ref30.name,
	        directives = _ref30.directives,
	        fields = _ref30.fields;
	    return join(['input', name, join(directives, ' '), block(fields)], ' ');
	  }),
	  DirectiveDefinition: addDescription(function (_ref31) {
	    var name = _ref31.name,
	        args = _ref31.arguments,
	        repeatable = _ref31.repeatable,
	        locations = _ref31.locations;
	    return 'directive @' + name + (hasMultilineItems(args) ? wrap('(\n', indent(join(args, '\n')), '\n)') : wrap('(', join(args, ', '), ')')) + (repeatable ? ' repeatable' : '') + ' on ' + join(locations, ' | ');
	  }),
	  SchemaExtension: function SchemaExtension(_ref32) {
	    var directives = _ref32.directives,
	        operationTypes = _ref32.operationTypes;
	    return join(['extend schema', join(directives, ' '), block(operationTypes)], ' ');
	  },
	  ScalarTypeExtension: function ScalarTypeExtension(_ref33) {
	    var name = _ref33.name,
	        directives = _ref33.directives;
	    return join(['extend scalar', name, join(directives, ' ')], ' ');
	  },
	  ObjectTypeExtension: function ObjectTypeExtension(_ref34) {
	    var name = _ref34.name,
	        interfaces = _ref34.interfaces,
	        directives = _ref34.directives,
	        fields = _ref34.fields;
	    return join(['extend type', name, wrap('implements ', join(interfaces, ' & ')), join(directives, ' '), block(fields)], ' ');
	  },
	  InterfaceTypeExtension: function InterfaceTypeExtension(_ref35) {
	    var name = _ref35.name,
	        directives = _ref35.directives,
	        fields = _ref35.fields;
	    return join(['extend interface', name, join(directives, ' '), block(fields)], ' ');
	  },
	  UnionTypeExtension: function UnionTypeExtension(_ref36) {
	    var name = _ref36.name,
	        directives = _ref36.directives,
	        types = _ref36.types;
	    return join(['extend union', name, join(directives, ' '), types && types.length !== 0 ? '= ' + join(types, ' | ') : ''], ' ');
	  },
	  EnumTypeExtension: function EnumTypeExtension(_ref37) {
	    var name = _ref37.name,
	        directives = _ref37.directives,
	        values = _ref37.values;
	    return join(['extend enum', name, join(directives, ' '), block(values)], ' ');
	  },
	  InputObjectTypeExtension: function InputObjectTypeExtension(_ref38) {
	    var name = _ref38.name,
	        directives = _ref38.directives,
	        fields = _ref38.fields;
	    return join(['extend input', name, join(directives, ' '), block(fields)], ' ');
	  }
	};

	function addDescription(cb) {
	  return function (node) {
	    return join([node.description, cb(node)], '\n');
	  };
	}
	/**
	 * Given maybeArray, print an empty string if it is null or empty, otherwise
	 * print all items together separated by separator if provided
	 */


	function join(maybeArray, separator) {
	  return maybeArray ? maybeArray.filter(function (x) {
	    return x;
	  }).join(separator || '') : '';
	}
	/**
	 * Given array, print each item on its own line, wrapped in an
	 * indented "{ }" block.
	 */


	function block(array) {
	  return array && array.length !== 0 ? '{\n' + indent(join(array, '\n')) + '\n}' : '';
	}
	/**
	 * If maybeString is not null or empty, then wrap with start and end, otherwise
	 * print an empty string.
	 */


	function wrap(start, maybeString, end) {
	  return maybeString ? start + maybeString + (end || '') : '';
	}

	function indent(maybeString) {
	  return maybeString && '  ' + maybeString.replace(/\n/g, '\n  ');
	}

	function isMultiline(string) {
	  return string.indexOf('\n') !== -1;
	}

	function hasMultilineItems(maybeArray) {
	  return maybeArray && maybeArray.some(isMultiline);
	}

	var printer = /*#__PURE__*/Object.freeze({
		__proto__: null,
		print: print
	});

	/**
	 * Copyright (c) 2016, Lee Byron
	 * All rights reserved.
	 *
	 * This source code is licensed under the MIT license found in the
	 * LICENSE file in the root directory of this source tree.
	 *
	 * @flow
	 * @ignore
	 */

	/**
	 * [Iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#iterator)
	 * is a *protocol* which describes a standard way to produce a sequence of
	 * values, typically the values of the Iterable represented by this Iterator.
	 *
	 * While described by the [ES2015 version of JavaScript](http://www.ecma-international.org/ecma-262/6.0/#sec-iterator-interface)
	 * it can be utilized by any version of JavaScript.
	 *
	 * @external Iterator
	 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#iterator|MDN Iteration protocols}
	 */

	/**
	 * [Iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#iterable)
	 * is a *protocol* which when implemented allows a JavaScript object to define
	 * their iteration behavior, such as what values are looped over in a
	 * [`for...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of)
	 * loop or `iterall`'s `forEach` function. Many [built-in types](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#Builtin_iterables)
	 * implement the Iterable protocol, including `Array` and `Map`.
	 *
	 * While described by the [ES2015 version of JavaScript](http://www.ecma-international.org/ecma-262/6.0/#sec-iterable-interface)
	 * it can be utilized by any version of JavaScript.
	 *
	 * @external Iterable
	 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#iterable|MDN Iteration protocols}
	 */

	// In ES2015 environments, Symbol exists
	var SYMBOL /*: any */ = typeof Symbol === 'function' ? Symbol : void 0;

	// In ES2015 (or a polyfilled) environment, this will be Symbol.iterator
	var SYMBOL_ITERATOR = SYMBOL && SYMBOL.iterator;

	/**
	 * Returns true if the provided object implements the Iterator protocol via
	 * either implementing a `Symbol.iterator` or `"@@iterator"` method.
	 *
	 * @example
	 *
	 * var isIterable = require('iterall').isIterable
	 * isIterable([ 1, 2, 3 ]) // true
	 * isIterable('ABC') // true
	 * isIterable({ length: 1, 0: 'Alpha' }) // false
	 * isIterable({ key: 'value' }) // false
	 * isIterable(new Map()) // true
	 *
	 * @param obj
	 *   A value which might implement the Iterable protocol.
	 * @return {boolean} true if Iterable.
	 */
	/*:: declare export function isIterable(obj: any): boolean; */
	function isIterable(obj) {
	  return !!getIteratorMethod(obj)
	}

	/**
	 * Returns true if the provided object implements the Array-like protocol via
	 * defining a positive-integer `length` property.
	 *
	 * @example
	 *
	 * var isArrayLike = require('iterall').isArrayLike
	 * isArrayLike([ 1, 2, 3 ]) // true
	 * isArrayLike('ABC') // true
	 * isArrayLike({ length: 1, 0: 'Alpha' }) // true
	 * isArrayLike({ key: 'value' }) // false
	 * isArrayLike(new Map()) // false
	 *
	 * @param obj
	 *   A value which might implement the Array-like protocol.
	 * @return {boolean} true if Array-like.
	 */
	/*:: declare export function isArrayLike(obj: any): boolean; */
	function isArrayLike(obj) {
	  var length = obj != null && obj.length;
	  return typeof length === 'number' && length >= 0 && length % 1 === 0
	}

	/**
	 * Returns true if the provided object is an Object (i.e. not a string literal)
	 * and is either Iterable or Array-like.
	 *
	 * This may be used in place of [Array.isArray()][isArray] to determine if an
	 * object should be iterated-over. It always excludes string literals and
	 * includes Arrays (regardless of if it is Iterable). It also includes other
	 * Array-like objects such as NodeList, TypedArray, and Buffer.
	 *
	 * @example
	 *
	 * var isCollection = require('iterall').isCollection
	 * isCollection([ 1, 2, 3 ]) // true
	 * isCollection('ABC') // false
	 * isCollection({ length: 1, 0: 'Alpha' }) // true
	 * isCollection({ key: 'value' }) // false
	 * isCollection(new Map()) // true
	 *
	 * @example
	 *
	 * var forEach = require('iterall').forEach
	 * if (isCollection(obj)) {
	 *   forEach(obj, function (value) {
	 *     console.log(value)
	 *   })
	 * }
	 *
	 * @param obj
	 *   An Object value which might implement the Iterable or Array-like protocols.
	 * @return {boolean} true if Iterable or Array-like Object.
	 */
	/*:: declare export function isCollection(obj: any): boolean; */
	function isCollection(obj) {
	  return Object(obj) === obj && (isArrayLike(obj) || isIterable(obj))
	}

	/**
	 * If the provided object implements the Iterator protocol, its Iterator object
	 * is returned. Otherwise returns undefined.
	 *
	 * @example
	 *
	 * var getIterator = require('iterall').getIterator
	 * var iterator = getIterator([ 1, 2, 3 ])
	 * iterator.next() // { value: 1, done: false }
	 * iterator.next() // { value: 2, done: false }
	 * iterator.next() // { value: 3, done: false }
	 * iterator.next() // { value: undefined, done: true }
	 *
	 * @template T the type of each iterated value
	 * @param {Iterable<T>} iterable
	 *   An Iterable object which is the source of an Iterator.
	 * @return {Iterator<T>} new Iterator instance.
	 */
	/*:: declare export var getIterator:
	  & (<+TValue>(iterable: Iterable<TValue>) => Iterator<TValue>)
	  & ((iterable: mixed) => void | Iterator<mixed>); */
	function getIterator(iterable) {
	  var method = getIteratorMethod(iterable);
	  if (method) {
	    return method.call(iterable)
	  }
	}

	/**
	 * If the provided object implements the Iterator protocol, the method
	 * responsible for producing its Iterator object is returned.
	 *
	 * This is used in rare cases for performance tuning. This method must be called
	 * with obj as the contextual this-argument.
	 *
	 * @example
	 *
	 * var getIteratorMethod = require('iterall').getIteratorMethod
	 * var myArray = [ 1, 2, 3 ]
	 * var method = getIteratorMethod(myArray)
	 * if (method) {
	 *   var iterator = method.call(myArray)
	 * }
	 *
	 * @template T the type of each iterated value
	 * @param {Iterable<T>} iterable
	 *   An Iterable object which defines an `@@iterator` method.
	 * @return {function(): Iterator<T>} `@@iterator` method.
	 */
	/*:: declare export var getIteratorMethod:
	  & (<+TValue>(iterable: Iterable<TValue>) => (() => Iterator<TValue>))
	  & ((iterable: mixed) => (void | (() => Iterator<mixed>))); */
	function getIteratorMethod(iterable) {
	  if (iterable != null) {
	    var method =
	      (SYMBOL_ITERATOR && iterable[SYMBOL_ITERATOR]) || iterable['@@iterator'];
	    if (typeof method === 'function') {
	      return method
	    }
	  }
	}

	/**
	 * Given an object which either implements the Iterable protocol or is
	 * Array-like, iterate over it, calling the `callback` at each iteration.
	 *
	 * Use `forEach` where you would expect to use a `for ... of` loop in ES6.
	 * However `forEach` adheres to the behavior of [Array#forEach][] described in
	 * the ECMAScript specification, skipping over "holes" in Array-likes. It will
	 * also delegate to a `forEach` method on `collection` if one is defined,
	 * ensuring native performance for `Arrays`.
	 *
	 * Similar to [Array#forEach][], the `callback` function accepts three
	 * arguments, and is provided with `thisArg` as the calling context.
	 *
	 * Note: providing an infinite Iterator to forEach will produce an error.
	 *
	 * [Array#forEach]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach
	 *
	 * @example
	 *
	 * var forEach = require('iterall').forEach
	 *
	 * forEach(myIterable, function (value, index, iterable) {
	 *   console.log(value, index, iterable === myIterable)
	 * })
	 *
	 * @example
	 *
	 * // ES6:
	 * for (let value of myIterable) {
	 *   console.log(value)
	 * }
	 *
	 * // Any JavaScript environment:
	 * forEach(myIterable, function (value) {
	 *   console.log(value)
	 * })
	 *
	 * @template T the type of each iterated value
	 * @param {Iterable<T>|{ length: number }} collection
	 *   The Iterable or array to iterate over.
	 * @param {function(T, number, object)} callback
	 *   Function to execute for each iteration, taking up to three arguments
	 * @param [thisArg]
	 *   Optional. Value to use as `this` when executing `callback`.
	 */
	/*:: declare export var forEach:
	  & (<+TValue, TCollection: Iterable<TValue>>(
	      collection: TCollection,
	      callbackFn: (value: TValue, index: number, collection: TCollection) => any,
	      thisArg?: any
	    ) => void)
	  & (<TCollection: {length: number}>(
	      collection: TCollection,
	      callbackFn: (value: mixed, index: number, collection: TCollection) => any,
	      thisArg?: any
	    ) => void); */
	function forEach(collection, callback, thisArg) {
	  if (collection != null) {
	    if (typeof collection.forEach === 'function') {
	      return collection.forEach(callback, thisArg)
	    }
	    var i = 0;
	    var iterator = getIterator(collection);
	    if (iterator) {
	      var step;
	      while (!(step = iterator.next()).done) {
	        callback.call(thisArg, step.value, i++, collection);
	        // Infinite Iterators could cause forEach to run forever.
	        // After a very large number of iterations, produce an error.
	        /* istanbul ignore if */
	        if (i > 9999999) {
	          throw new TypeError('Near-infinite iteration.')
	        }
	      }
	    } else if (isArrayLike(collection)) {
	      for (; i < collection.length; i++) {
	        if (collection.hasOwnProperty(i)) {
	          callback.call(thisArg, collection[i], i, collection);
	        }
	      }
	    }
	  }
	}

	/////////////////////////////////////////////////////
	//                                                 //
	//                 ASYNC ITERATORS                 //
	//                                                 //
	/////////////////////////////////////////////////////

	/**
	 * [AsyncIterable](https://tc39.github.io/proposal-async-iteration/#sec-asynciterable-interface)
	 * is a *protocol* which when implemented allows a JavaScript object to define
	 * an asynchronous iteration behavior, such as what values are looped over in
	 * a [`for-await-of`](https://tc39.github.io/proposal-async-iteration/#sec-for-in-and-for-of-statements)
	 * loop or `iterall`'s {@link forAwaitEach} function.
	 *
	 * While described as a proposed addition to the [ES2017 version of JavaScript](https://tc39.github.io/proposal-async-iteration/)
	 * it can be utilized by any version of JavaScript.
	 *
	 * @external AsyncIterable
	 * @see {@link https://tc39.github.io/proposal-async-iteration/#sec-asynciterable-interface|Async Iteration Proposal}
	 * @template T The type of each iterated value
	 * @property {function (): AsyncIterator<T>} Symbol.asyncIterator
	 *   A method which produces an AsyncIterator for this AsyncIterable.
	 */

	/**
	 * [AsyncIterator](https://tc39.github.io/proposal-async-iteration/#sec-asynciterator-interface)
	 * is a *protocol* which describes a standard way to produce and consume an
	 * asynchronous sequence of values, typically the values of the
	 * {@link AsyncIterable} represented by this {@link AsyncIterator}.
	 *
	 * AsyncIterator is similar to Observable or Stream. Like an {@link Iterator} it
	 * also as a `next()` method, however instead of an IteratorResult,
	 * calling this method returns a {@link Promise} for a IteratorResult.
	 *
	 * While described as a proposed addition to the [ES2017 version of JavaScript](https://tc39.github.io/proposal-async-iteration/)
	 * it can be utilized by any version of JavaScript.
	 *
	 * @external AsyncIterator
	 * @see {@link https://tc39.github.io/proposal-async-iteration/#sec-asynciterator-interface|Async Iteration Proposal}
	 */

	// In ES2017 (or a polyfilled) environment, this will be Symbol.asyncIterator
	var SYMBOL_ASYNC_ITERATOR = SYMBOL && SYMBOL.asyncIterator;

	/**
	 * A property name to be used as the name of an AsyncIterable's method
	 * responsible for producing an Iterator, referred to as `@@asyncIterator`.
	 * Typically represents the value `Symbol.asyncIterator` but falls back to the
	 * string `"@@asyncIterator"` when `Symbol.asyncIterator` is not defined.
	 *
	 * Use `$$asyncIterator` for defining new AsyncIterables instead of
	 * `Symbol.asyncIterator`, but do not use it for accessing existing Iterables,
	 * instead use {@link getAsyncIterator} or {@link isAsyncIterable}.
	 *
	 * @example
	 *
	 * var $$asyncIterator = require('iterall').$$asyncIterator
	 *
	 * function Chirper (to) {
	 *   this.to = to
	 * }
	 *
	 * Chirper.prototype[$$asyncIterator] = function () {
	 *   return {
	 *     to: this.to,
	 *     num: 0,
	 *     next () {
	 *       return new Promise(resolve => {
	 *         if (this.num >= this.to) {
	 *           resolve({ value: undefined, done: true })
	 *         } else {
	 *           setTimeout(() => {
	 *             resolve({ value: this.num++, done: false })
	 *           }, 1000)
	 *         }
	 *       })
	 *     }
	 *   }
	 * }
	 *
	 * var chirper = new Chirper(3)
	 * for await (var number of chirper) {
	 *   console.log(number) // 0 ...wait... 1 ...wait... 2
	 * }
	 *
	 * @type {Symbol|string}
	 */
	/*:: declare export var $$asyncIterator: '@@asyncIterator'; */
	var $$asyncIterator = SYMBOL_ASYNC_ITERATOR || '@@asyncIterator';

	/**
	 * Returns true if the provided object implements the AsyncIterator protocol via
	 * either implementing a `Symbol.asyncIterator` or `"@@asyncIterator"` method.
	 *
	 * @example
	 *
	 * var isAsyncIterable = require('iterall').isAsyncIterable
	 * isAsyncIterable(myStream) // true
	 * isAsyncIterable('ABC') // false
	 *
	 * @param obj
	 *   A value which might implement the AsyncIterable protocol.
	 * @return {boolean} true if AsyncIterable.
	 */
	/*:: declare export function isAsyncIterable(obj: any): boolean; */
	function isAsyncIterable(obj) {
	  return !!getAsyncIteratorMethod(obj)
	}

	/**
	 * If the provided object implements the AsyncIterator protocol, its
	 * AsyncIterator object is returned. Otherwise returns undefined.
	 *
	 * @example
	 *
	 * var getAsyncIterator = require('iterall').getAsyncIterator
	 * var asyncIterator = getAsyncIterator(myStream)
	 * asyncIterator.next().then(console.log) // { value: 1, done: false }
	 * asyncIterator.next().then(console.log) // { value: 2, done: false }
	 * asyncIterator.next().then(console.log) // { value: 3, done: false }
	 * asyncIterator.next().then(console.log) // { value: undefined, done: true }
	 *
	 * @template T the type of each iterated value
	 * @param {AsyncIterable<T>} asyncIterable
	 *   An AsyncIterable object which is the source of an AsyncIterator.
	 * @return {AsyncIterator<T>} new AsyncIterator instance.
	 */
	/*:: declare export var getAsyncIterator:
	  & (<+TValue>(asyncIterable: AsyncIterable<TValue>) => AsyncIterator<TValue>)
	  & ((asyncIterable: mixed) => (void | AsyncIterator<mixed>)); */
	function getAsyncIterator(asyncIterable) {
	  var method = getAsyncIteratorMethod(asyncIterable);
	  if (method) {
	    return method.call(asyncIterable)
	  }
	}

	/**
	 * If the provided object implements the AsyncIterator protocol, the method
	 * responsible for producing its AsyncIterator object is returned.
	 *
	 * This is used in rare cases for performance tuning. This method must be called
	 * with obj as the contextual this-argument.
	 *
	 * @example
	 *
	 * var getAsyncIteratorMethod = require('iterall').getAsyncIteratorMethod
	 * var method = getAsyncIteratorMethod(myStream)
	 * if (method) {
	 *   var asyncIterator = method.call(myStream)
	 * }
	 *
	 * @template T the type of each iterated value
	 * @param {AsyncIterable<T>} asyncIterable
	 *   An AsyncIterable object which defines an `@@asyncIterator` method.
	 * @return {function(): AsyncIterator<T>} `@@asyncIterator` method.
	 */
	/*:: declare export var getAsyncIteratorMethod:
	  & (<+TValue>(asyncIterable: AsyncIterable<TValue>) => (() => AsyncIterator<TValue>))
	  & ((asyncIterable: mixed) => (void | (() => AsyncIterator<mixed>))); */
	function getAsyncIteratorMethod(asyncIterable) {
	  if (asyncIterable != null) {
	    var method =
	      (SYMBOL_ASYNC_ITERATOR && asyncIterable[SYMBOL_ASYNC_ITERATOR]) ||
	      asyncIterable['@@asyncIterator'];
	    if (typeof method === 'function') {
	      return method
	    }
	  }
	}

	/**
	 * Returns true if a value is null, undefined, or NaN.
	 */
	function isNullish(value) {
	  return value === null || value === undefined || value !== value;
	}

	/**
	 * Produces a GraphQL Value AST given a JavaScript value.
	 *
	 * A GraphQL type must be provided, which will be used to interpret different
	 * JavaScript values.
	 *
	 * | JSON Value    | GraphQL Value        |
	 * | ------------- | -------------------- |
	 * | Object        | Input Object         |
	 * | Array         | List                 |
	 * | Boolean       | Boolean              |
	 * | String        | String / Enum Value  |
	 * | Number        | Int / Float          |
	 * | Mixed         | Enum Value           |
	 * | null          | NullValue            |
	 *
	 */

	function astFromValue(value, type) {
	  if (isNonNullType(type)) {
	    var astValue = astFromValue(value, type.ofType);

	    if (astValue && astValue.kind === Kind.NULL) {
	      return null;
	    }

	    return astValue;
	  } // only explicit null, not undefined, NaN


	  if (value === null) {
	    return {
	      kind: Kind.NULL
	    };
	  } // undefined, NaN


	  if (isInvalid(value)) {
	    return null;
	  } // Convert JavaScript array to GraphQL list. If the GraphQLType is a list, but
	  // the value is not an array, convert the value using the list's item type.


	  if (isListType(type)) {
	    var itemType = type.ofType;

	    if (isCollection(value)) {
	      var valuesNodes = [];
	      forEach(value, function (item) {
	        var itemNode = astFromValue(item, itemType);

	        if (itemNode) {
	          valuesNodes.push(itemNode);
	        }
	      });
	      return {
	        kind: Kind.LIST,
	        values: valuesNodes
	      };
	    }

	    return astFromValue(value, itemType);
	  } // Populate the fields of the input object by creating ASTs from each value
	  // in the JavaScript object according to the fields in the input type.


	  if (isInputObjectType(type)) {
	    if (!isObjectLike(value)) {
	      return null;
	    }

	    var fieldNodes = [];

	    for (var _i2 = 0, _objectValues2 = objectValues(type.getFields()); _i2 < _objectValues2.length; _i2++) {
	      var field = _objectValues2[_i2];
	      var fieldValue = astFromValue(value[field.name], field.type);

	      if (fieldValue) {
	        fieldNodes.push({
	          kind: Kind.OBJECT_FIELD,
	          name: {
	            kind: Kind.NAME,
	            value: field.name
	          },
	          value: fieldValue
	        });
	      }
	    }

	    return {
	      kind: Kind.OBJECT,
	      fields: fieldNodes
	    };
	  }

	  /* istanbul ignore else */
	  if (isLeafType(type)) {
	    // Since value is an internally represented value, it must be serialized
	    // to an externally represented value before converting into an AST.
	    var serialized = type.serialize(value);

	    if (isNullish(serialized)) {
	      return null;
	    } // Others serialize based on their corresponding JavaScript scalar types.


	    if (typeof serialized === 'boolean') {
	      return {
	        kind: Kind.BOOLEAN,
	        value: serialized
	      };
	    } // JavaScript numbers can be Int or Float values.


	    if (typeof serialized === 'number') {
	      var stringNum = String(serialized);
	      return integerStringRegExp.test(stringNum) ? {
	        kind: Kind.INT,
	        value: stringNum
	      } : {
	        kind: Kind.FLOAT,
	        value: stringNum
	      };
	    }

	    if (typeof serialized === 'string') {
	      // Enum types use Enum literals.
	      if (isEnumType(type)) {
	        return {
	          kind: Kind.ENUM,
	          value: serialized
	        };
	      } // ID types can use Int literals.


	      if (type === GraphQLID && integerStringRegExp.test(serialized)) {
	        return {
	          kind: Kind.INT,
	          value: serialized
	        };
	      }

	      return {
	        kind: Kind.STRING,
	        value: serialized
	      };
	    }

	    throw new TypeError("Cannot convert value to AST: ".concat(inspect(serialized)));
	  } // Not reachable. All possible input types have been considered.


	  /* istanbul ignore next */
	  invariant(false, 'Unexpected input type: ' + inspect(type));
	}
	/**
	 * IntValue:
	 *   - NegativeSign? 0
	 *   - NegativeSign? NonZeroDigit ( Digit+ )?
	 */

	var integerStringRegExp = /^-?(?:0|[1-9][0-9]*)$/;

	var __Schema = new GraphQLObjectType({
	  name: '__Schema',
	  description: 'A GraphQL Schema defines the capabilities of a GraphQL server. It exposes all available types and directives on the server, as well as the entry points for query, mutation, and subscription operations.',
	  fields: function fields() {
	    return {
	      types: {
	        description: 'A list of all types supported by this server.',
	        type: GraphQLNonNull(GraphQLList(GraphQLNonNull(__Type))),
	        resolve: function resolve(schema) {
	          return objectValues(schema.getTypeMap());
	        }
	      },
	      queryType: {
	        description: 'The type that query operations will be rooted at.',
	        type: GraphQLNonNull(__Type),
	        resolve: function resolve(schema) {
	          return schema.getQueryType();
	        }
	      },
	      mutationType: {
	        description: 'If this server supports mutation, the type that mutation operations will be rooted at.',
	        type: __Type,
	        resolve: function resolve(schema) {
	          return schema.getMutationType();
	        }
	      },
	      subscriptionType: {
	        description: 'If this server support subscription, the type that subscription operations will be rooted at.',
	        type: __Type,
	        resolve: function resolve(schema) {
	          return schema.getSubscriptionType();
	        }
	      },
	      directives: {
	        description: 'A list of all directives supported by this server.',
	        type: GraphQLNonNull(GraphQLList(GraphQLNonNull(__Directive))),
	        resolve: function resolve(schema) {
	          return schema.getDirectives();
	        }
	      }
	    };
	  }
	});
	var __Directive = new GraphQLObjectType({
	  name: '__Directive',
	  description: "A Directive provides a way to describe alternate runtime execution and type validation behavior in a GraphQL document.\n\nIn some cases, you need to provide options to alter GraphQL's execution behavior in ways field arguments will not suffice, such as conditionally including or skipping a field. Directives provide this by describing additional information to the executor.",
	  fields: function fields() {
	    return {
	      name: {
	        type: GraphQLNonNull(GraphQLString),
	        resolve: function resolve(obj) {
	          return obj.name;
	        }
	      },
	      description: {
	        type: GraphQLString,
	        resolve: function resolve(obj) {
	          return obj.description;
	        }
	      },
	      locations: {
	        type: GraphQLNonNull(GraphQLList(GraphQLNonNull(__DirectiveLocation))),
	        resolve: function resolve(obj) {
	          return obj.locations;
	        }
	      },
	      args: {
	        type: GraphQLNonNull(GraphQLList(GraphQLNonNull(__InputValue))),
	        resolve: function resolve(directive) {
	          return directive.args;
	        }
	      }
	    };
	  }
	});
	var __DirectiveLocation = new GraphQLEnumType({
	  name: '__DirectiveLocation',
	  description: 'A Directive can be adjacent to many parts of the GraphQL language, a __DirectiveLocation describes one such possible adjacencies.',
	  values: {
	    QUERY: {
	      value: DirectiveLocation.QUERY,
	      description: 'Location adjacent to a query operation.'
	    },
	    MUTATION: {
	      value: DirectiveLocation.MUTATION,
	      description: 'Location adjacent to a mutation operation.'
	    },
	    SUBSCRIPTION: {
	      value: DirectiveLocation.SUBSCRIPTION,
	      description: 'Location adjacent to a subscription operation.'
	    },
	    FIELD: {
	      value: DirectiveLocation.FIELD,
	      description: 'Location adjacent to a field.'
	    },
	    FRAGMENT_DEFINITION: {
	      value: DirectiveLocation.FRAGMENT_DEFINITION,
	      description: 'Location adjacent to a fragment definition.'
	    },
	    FRAGMENT_SPREAD: {
	      value: DirectiveLocation.FRAGMENT_SPREAD,
	      description: 'Location adjacent to a fragment spread.'
	    },
	    INLINE_FRAGMENT: {
	      value: DirectiveLocation.INLINE_FRAGMENT,
	      description: 'Location adjacent to an inline fragment.'
	    },
	    VARIABLE_DEFINITION: {
	      value: DirectiveLocation.VARIABLE_DEFINITION,
	      description: 'Location adjacent to a variable definition.'
	    },
	    SCHEMA: {
	      value: DirectiveLocation.SCHEMA,
	      description: 'Location adjacent to a schema definition.'
	    },
	    SCALAR: {
	      value: DirectiveLocation.SCALAR,
	      description: 'Location adjacent to a scalar definition.'
	    },
	    OBJECT: {
	      value: DirectiveLocation.OBJECT,
	      description: 'Location adjacent to an object type definition.'
	    },
	    FIELD_DEFINITION: {
	      value: DirectiveLocation.FIELD_DEFINITION,
	      description: 'Location adjacent to a field definition.'
	    },
	    ARGUMENT_DEFINITION: {
	      value: DirectiveLocation.ARGUMENT_DEFINITION,
	      description: 'Location adjacent to an argument definition.'
	    },
	    INTERFACE: {
	      value: DirectiveLocation.INTERFACE,
	      description: 'Location adjacent to an interface definition.'
	    },
	    UNION: {
	      value: DirectiveLocation.UNION,
	      description: 'Location adjacent to a union definition.'
	    },
	    ENUM: {
	      value: DirectiveLocation.ENUM,
	      description: 'Location adjacent to an enum definition.'
	    },
	    ENUM_VALUE: {
	      value: DirectiveLocation.ENUM_VALUE,
	      description: 'Location adjacent to an enum value definition.'
	    },
	    INPUT_OBJECT: {
	      value: DirectiveLocation.INPUT_OBJECT,
	      description: 'Location adjacent to an input object type definition.'
	    },
	    INPUT_FIELD_DEFINITION: {
	      value: DirectiveLocation.INPUT_FIELD_DEFINITION,
	      description: 'Location adjacent to an input object field definition.'
	    }
	  }
	});
	var __Type = new GraphQLObjectType({
	  name: '__Type',
	  description: 'The fundamental unit of any GraphQL Schema is the type. There are many kinds of types in GraphQL as represented by the `__TypeKind` enum.\n\nDepending on the kind of a type, certain fields describe information about that type. Scalar types provide no information beyond a name and description, while Enum types provide their values. Object and Interface types provide the fields they describe. Abstract types, Union and Interface, provide the Object types possible at runtime. List and NonNull types compose other types.',
	  fields: function fields() {
	    return {
	      kind: {
	        type: GraphQLNonNull(__TypeKind),
	        resolve: function resolve(type) {
	          if (isScalarType(type)) {
	            return TypeKind.SCALAR;
	          } else if (isObjectType(type)) {
	            return TypeKind.OBJECT;
	          } else if (isInterfaceType(type)) {
	            return TypeKind.INTERFACE;
	          } else if (isUnionType(type)) {
	            return TypeKind.UNION;
	          } else if (isEnumType(type)) {
	            return TypeKind.ENUM;
	          } else if (isInputObjectType(type)) {
	            return TypeKind.INPUT_OBJECT;
	          } else if (isListType(type)) {
	            return TypeKind.LIST;
	          } else if (isNonNullType(type)) {
	            return TypeKind.NON_NULL;
	          } // Not reachable. All possible types have been considered.


	          /* istanbul ignore next */
	          invariant(false, "Unexpected type: \"".concat(inspect(type), "\"."));
	        }
	      },
	      name: {
	        type: GraphQLString,
	        resolve: function resolve(obj) {
	          return obj.name !== undefined ? obj.name : undefined;
	        }
	      },
	      description: {
	        type: GraphQLString,
	        resolve: function resolve(obj) {
	          return obj.description !== undefined ? obj.description : undefined;
	        }
	      },
	      fields: {
	        type: GraphQLList(GraphQLNonNull(__Field)),
	        args: {
	          includeDeprecated: {
	            type: GraphQLBoolean,
	            defaultValue: false
	          }
	        },
	        resolve: function resolve(type, _ref) {
	          var includeDeprecated = _ref.includeDeprecated;

	          if (isObjectType(type) || isInterfaceType(type)) {
	            var fields = objectValues(type.getFields());

	            if (!includeDeprecated) {
	              fields = fields.filter(function (field) {
	                return !field.deprecationReason;
	              });
	            }

	            return fields;
	          }

	          return null;
	        }
	      },
	      interfaces: {
	        type: GraphQLList(GraphQLNonNull(__Type)),
	        resolve: function resolve(type) {
	          if (isObjectType(type)) {
	            return type.getInterfaces();
	          }
	        }
	      },
	      possibleTypes: {
	        type: GraphQLList(GraphQLNonNull(__Type)),
	        resolve: function resolve(type, args, context, _ref2) {
	          var schema = _ref2.schema;

	          if (isAbstractType(type)) {
	            return schema.getPossibleTypes(type);
	          }
	        }
	      },
	      enumValues: {
	        type: GraphQLList(GraphQLNonNull(__EnumValue)),
	        args: {
	          includeDeprecated: {
	            type: GraphQLBoolean,
	            defaultValue: false
	          }
	        },
	        resolve: function resolve(type, _ref3) {
	          var includeDeprecated = _ref3.includeDeprecated;

	          if (isEnumType(type)) {
	            var values = type.getValues();

	            if (!includeDeprecated) {
	              values = values.filter(function (value) {
	                return !value.deprecationReason;
	              });
	            }

	            return values;
	          }
	        }
	      },
	      inputFields: {
	        type: GraphQLList(GraphQLNonNull(__InputValue)),
	        resolve: function resolve(type) {
	          if (isInputObjectType(type)) {
	            return objectValues(type.getFields());
	          }
	        }
	      },
	      ofType: {
	        type: __Type,
	        resolve: function resolve(obj) {
	          return obj.ofType !== undefined ? obj.ofType : undefined;
	        }
	      }
	    };
	  }
	});
	var __Field = new GraphQLObjectType({
	  name: '__Field',
	  description: 'Object and Interface types are described by a list of Fields, each of which has a name, potentially a list of arguments, and a return type.',
	  fields: function fields() {
	    return {
	      name: {
	        type: GraphQLNonNull(GraphQLString),
	        resolve: function resolve(obj) {
	          return obj.name;
	        }
	      },
	      description: {
	        type: GraphQLString,
	        resolve: function resolve(obj) {
	          return obj.description;
	        }
	      },
	      args: {
	        type: GraphQLNonNull(GraphQLList(GraphQLNonNull(__InputValue))),
	        resolve: function resolve(field) {
	          return field.args;
	        }
	      },
	      type: {
	        type: GraphQLNonNull(__Type),
	        resolve: function resolve(obj) {
	          return obj.type;
	        }
	      },
	      isDeprecated: {
	        type: GraphQLNonNull(GraphQLBoolean),
	        resolve: function resolve(obj) {
	          return obj.isDeprecated;
	        }
	      },
	      deprecationReason: {
	        type: GraphQLString,
	        resolve: function resolve(obj) {
	          return obj.deprecationReason;
	        }
	      }
	    };
	  }
	});
	var __InputValue = new GraphQLObjectType({
	  name: '__InputValue',
	  description: 'Arguments provided to Fields or Directives and the input fields of an InputObject are represented as Input Values which describe their type and optionally a default value.',
	  fields: function fields() {
	    return {
	      name: {
	        type: GraphQLNonNull(GraphQLString),
	        resolve: function resolve(obj) {
	          return obj.name;
	        }
	      },
	      description: {
	        type: GraphQLString,
	        resolve: function resolve(obj) {
	          return obj.description;
	        }
	      },
	      type: {
	        type: GraphQLNonNull(__Type),
	        resolve: function resolve(obj) {
	          return obj.type;
	        }
	      },
	      defaultValue: {
	        type: GraphQLString,
	        description: 'A GraphQL-formatted string representing the default value for this input value.',
	        resolve: function resolve(inputVal) {
	          var valueAST = astFromValue(inputVal.defaultValue, inputVal.type);
	          return valueAST ? print(valueAST) : null;
	        }
	      }
	    };
	  }
	});
	var __EnumValue = new GraphQLObjectType({
	  name: '__EnumValue',
	  description: 'One possible value for a given Enum. Enum values are unique values, not a placeholder for a string or numeric value. However an Enum value is returned in a JSON response as a string.',
	  fields: function fields() {
	    return {
	      name: {
	        type: GraphQLNonNull(GraphQLString),
	        resolve: function resolve(obj) {
	          return obj.name;
	        }
	      },
	      description: {
	        type: GraphQLString,
	        resolve: function resolve(obj) {
	          return obj.description;
	        }
	      },
	      isDeprecated: {
	        type: GraphQLNonNull(GraphQLBoolean),
	        resolve: function resolve(obj) {
	          return obj.isDeprecated;
	        }
	      },
	      deprecationReason: {
	        type: GraphQLString,
	        resolve: function resolve(obj) {
	          return obj.deprecationReason;
	        }
	      }
	    };
	  }
	});
	var TypeKind = Object.freeze({
	  SCALAR: 'SCALAR',
	  OBJECT: 'OBJECT',
	  INTERFACE: 'INTERFACE',
	  UNION: 'UNION',
	  ENUM: 'ENUM',
	  INPUT_OBJECT: 'INPUT_OBJECT',
	  LIST: 'LIST',
	  NON_NULL: 'NON_NULL'
	});
	var __TypeKind = new GraphQLEnumType({
	  name: '__TypeKind',
	  description: 'An enum describing what kind of type a given `__Type` is.',
	  values: {
	    SCALAR: {
	      value: TypeKind.SCALAR,
	      description: 'Indicates this type is a scalar.'
	    },
	    OBJECT: {
	      value: TypeKind.OBJECT,
	      description: 'Indicates this type is an object. `fields` and `interfaces` are valid fields.'
	    },
	    INTERFACE: {
	      value: TypeKind.INTERFACE,
	      description: 'Indicates this type is an interface. `fields` and `possibleTypes` are valid fields.'
	    },
	    UNION: {
	      value: TypeKind.UNION,
	      description: 'Indicates this type is a union. `possibleTypes` is a valid field.'
	    },
	    ENUM: {
	      value: TypeKind.ENUM,
	      description: 'Indicates this type is an enum. `enumValues` is a valid field.'
	    },
	    INPUT_OBJECT: {
	      value: TypeKind.INPUT_OBJECT,
	      description: 'Indicates this type is an input object. `inputFields` is a valid field.'
	    },
	    LIST: {
	      value: TypeKind.LIST,
	      description: 'Indicates this type is a list. `ofType` is a valid field.'
	    },
	    NON_NULL: {
	      value: TypeKind.NON_NULL,
	      description: 'Indicates this type is a non-null. `ofType` is a valid field.'
	    }
	  }
	});
	/**
	 * Note that these are GraphQLField and not GraphQLFieldConfig,
	 * so the format for args is different.
	 */

	var SchemaMetaFieldDef = {
	  name: '__schema',
	  type: GraphQLNonNull(__Schema),
	  description: 'Access the current type schema of this server.',
	  args: [],
	  resolve: function resolve(source, args, context, _ref4) {
	    var schema = _ref4.schema;
	    return schema;
	  },
	  deprecationReason: undefined,
	  extensions: undefined,
	  astNode: undefined
	};
	var TypeMetaFieldDef = {
	  name: '__type',
	  type: __Type,
	  description: 'Request the type information of a single type.',
	  args: [{
	    name: 'name',
	    description: undefined,
	    type: GraphQLNonNull(GraphQLString),
	    defaultValue: undefined,
	    extensions: undefined,
	    astNode: undefined
	  }],
	  resolve: function resolve(source, _ref5, context, _ref6) {
	    var name = _ref5.name;
	    var schema = _ref6.schema;
	    return schema.getType(name);
	  },
	  deprecationReason: undefined,
	  extensions: undefined,
	  astNode: undefined
	};
	var TypeNameMetaFieldDef = {
	  name: '__typename',
	  type: GraphQLNonNull(GraphQLString),
	  description: 'The name of the current Object type at runtime.',
	  args: [],
	  resolve: function resolve(source, args, context, _ref7) {
	    var parentType = _ref7.parentType;
	    return parentType.name;
	  },
	  deprecationReason: undefined,
	  extensions: undefined,
	  astNode: undefined
	};
	var introspectionTypes = Object.freeze([__Schema, __Directive, __DirectiveLocation, __Type, __Field, __InputValue, __EnumValue, __TypeKind]);
	function isIntrospectionType(type) {
	  return isNamedType(type) && introspectionTypes.some(function (_ref8) {
	    var name = _ref8.name;
	    return type.name === name;
	  });
	}

	/**
	 * Test if the given value is a GraphQL schema.
	 */

	// eslint-disable-next-line no-redeclare
	function isSchema(schema) {
	  return instanceOf(schema, GraphQLSchema);
	}
	function assertSchema(schema) {
	  if (!isSchema(schema)) {
	    throw new Error("Expected ".concat(inspect(schema), " to be a GraphQL schema."));
	  }

	  return schema;
	}
	/**
	 * Schema Definition
	 *
	 * A Schema is created by supplying the root types of each type of operation,
	 * query and mutation (optional). A schema definition is then supplied to the
	 * validator and executor.
	 *
	 * Example:
	 *
	 *     const MyAppSchema = new GraphQLSchema({
	 *       query: MyAppQueryRootType,
	 *       mutation: MyAppMutationRootType,
	 *     })
	 *
	 * Note: When the schema is constructed, by default only the types that are
	 * reachable by traversing the root types are included, other types must be
	 * explicitly referenced.
	 *
	 * Example:
	 *
	 *     const characterInterface = new GraphQLInterfaceType({
	 *       name: 'Character',
	 *       ...
	 *     });
	 *
	 *     const humanType = new GraphQLObjectType({
	 *       name: 'Human',
	 *       interfaces: [characterInterface],
	 *       ...
	 *     });
	 *
	 *     const droidType = new GraphQLObjectType({
	 *       name: 'Droid',
	 *       interfaces: [characterInterface],
	 *       ...
	 *     });
	 *
	 *     const schema = new GraphQLSchema({
	 *       query: new GraphQLObjectType({
	 *         name: 'Query',
	 *         fields: {
	 *           hero: { type: characterInterface, ... },
	 *         }
	 *       }),
	 *       ...
	 *       // Since this schema references only the `Character` interface it's
	 *       // necessary to explicitly list the types that implement it if
	 *       // you want them to be included in the final schema.
	 *       types: [humanType, droidType],
	 *     })
	 *
	 * Note: If an array of `directives` are provided to GraphQLSchema, that will be
	 * the exact list of directives represented and allowed. If `directives` is not
	 * provided then a default set of the specified directives (e.g. @include and
	 * @skip) will be used. If you wish to provide *additional* directives to these
	 * specified directives, you must explicitly declare them. Example:
	 *
	 *     const MyAppSchema = new GraphQLSchema({
	 *       ...
	 *       directives: specifiedDirectives.concat([ myCustomDirective ]),
	 *     })
	 *
	 */

	var GraphQLSchema =
	/*#__PURE__*/
	function () {
	  // Used as a cache for validateSchema().
	  // Referenced by validateSchema().
	  function GraphQLSchema(config) {
	    // If this schema was built from a source known to be valid, then it may be
	    // marked with assumeValid to avoid an additional type system validation.
	    if (config && config.assumeValid) {
	      this.__validationErrors = [];
	    } else {
	      this.__validationErrors = undefined; // Otherwise check for common mistakes during construction to produce
	      // clear and early error messages.

	      isObjectLike(config) || devAssert(0, 'Must provide configuration object.');
	      !config.types || Array.isArray(config.types) || devAssert(0, "\"types\" must be Array if provided but got: ".concat(inspect(config.types), "."));
	      !config.directives || Array.isArray(config.directives) || devAssert(0, '"directives" must be Array if provided but got: ' + "".concat(inspect(config.directives), "."));
	      !config.allowedLegacyNames || Array.isArray(config.allowedLegacyNames) || devAssert(0, '"allowedLegacyNames" must be Array if provided but got: ' + "".concat(inspect(config.allowedLegacyNames), "."));
	    }

	    this.extensions = config.extensions && toObjMap(config.extensions);
	    this.astNode = config.astNode;
	    this.extensionASTNodes = config.extensionASTNodes;
	    this.__allowedLegacyNames = config.allowedLegacyNames || [];
	    this._queryType = config.query;
	    this._mutationType = config.mutation;
	    this._subscriptionType = config.subscription; // Provide specified directives (e.g. @include and @skip) by default.

	    this._directives = config.directives || specifiedDirectives; // Build type map now to detect any errors within this schema.

	    var initialTypes = [this._queryType, this._mutationType, this._subscriptionType, __Schema].concat(config.types); // Keep track of all types referenced within the schema.

	    var typeMap = Object.create(null); // First by deeply visiting all initial types.

	    typeMap = initialTypes.reduce(typeMapReducer, typeMap); // Then by deeply visiting all directive types.

	    typeMap = this._directives.reduce(typeMapDirectiveReducer, typeMap); // Storing the resulting map for reference by the schema.

	    this._typeMap = typeMap;
	    this._possibleTypeMap = Object.create(null); // Keep track of all implementations by interface name.

	    this._implementations = Object.create(null);

	    for (var _i2 = 0, _objectValues2 = objectValues(this._typeMap); _i2 < _objectValues2.length; _i2++) {
	      var type = _objectValues2[_i2];

	      if (isObjectType(type)) {
	        for (var _i4 = 0, _type$getInterfaces2 = type.getInterfaces(); _i4 < _type$getInterfaces2.length; _i4++) {
	          var iface = _type$getInterfaces2[_i4];

	          if (isInterfaceType(iface)) {
	            var impls = this._implementations[iface.name];

	            if (impls) {
	              impls.push(type);
	            } else {
	              this._implementations[iface.name] = [type];
	            }
	          }
	        }
	      }
	    }
	  }

	  var _proto = GraphQLSchema.prototype;

	  _proto.getQueryType = function getQueryType() {
	    return this._queryType;
	  };

	  _proto.getMutationType = function getMutationType() {
	    return this._mutationType;
	  };

	  _proto.getSubscriptionType = function getSubscriptionType() {
	    return this._subscriptionType;
	  };

	  _proto.getTypeMap = function getTypeMap() {
	    return this._typeMap;
	  };

	  _proto.getType = function getType(name) {
	    return this.getTypeMap()[name];
	  };

	  _proto.getPossibleTypes = function getPossibleTypes(abstractType) {
	    if (isUnionType(abstractType)) {
	      return abstractType.getTypes();
	    }

	    return this._implementations[abstractType.name] || [];
	  };

	  _proto.isPossibleType = function isPossibleType(abstractType, possibleType) {
	    if (this._possibleTypeMap[abstractType.name] == null) {
	      var map = Object.create(null);

	      for (var _i6 = 0, _this$getPossibleType2 = this.getPossibleTypes(abstractType); _i6 < _this$getPossibleType2.length; _i6++) {
	        var type = _this$getPossibleType2[_i6];
	        map[type.name] = true;
	      }

	      this._possibleTypeMap[abstractType.name] = map;
	    }

	    return Boolean(this._possibleTypeMap[abstractType.name][possibleType.name]);
	  };

	  _proto.getDirectives = function getDirectives() {
	    return this._directives;
	  };

	  _proto.getDirective = function getDirective(name) {
	    return find(this.getDirectives(), function (directive) {
	      return directive.name === name;
	    });
	  };

	  _proto.toConfig = function toConfig() {
	    return {
	      query: this.getQueryType(),
	      mutation: this.getMutationType(),
	      subscription: this.getSubscriptionType(),
	      types: objectValues(this.getTypeMap()),
	      directives: this.getDirectives().slice(),
	      extensions: this.extensions,
	      astNode: this.astNode,
	      extensionASTNodes: this.extensionASTNodes || [],
	      assumeValid: this.__validationErrors !== undefined,
	      allowedLegacyNames: this.__allowedLegacyNames
	    };
	  };

	  return GraphQLSchema;
	}(); // Conditionally apply `[Symbol.toStringTag]` if `Symbol`s are supported

	defineToStringTag(GraphQLSchema);

	function typeMapReducer(map, type) {
	  if (!type) {
	    return map;
	  }

	  var namedType = getNamedType(type);
	  var seenType = map[namedType.name];

	  if (seenType) {
	    if (seenType !== namedType) {
	      throw new Error("Schema must contain uniquely named types but contains multiple types named \"".concat(namedType.name, "\"."));
	    }

	    return map;
	  }

	  map[namedType.name] = namedType;
	  var reducedMap = map;

	  if (isUnionType(namedType)) {
	    reducedMap = namedType.getTypes().reduce(typeMapReducer, reducedMap);
	  }

	  if (isObjectType(namedType)) {
	    reducedMap = namedType.getInterfaces().reduce(typeMapReducer, reducedMap);
	  }

	  if (isObjectType(namedType) || isInterfaceType(namedType)) {
	    for (var _i8 = 0, _objectValues4 = objectValues(namedType.getFields()); _i8 < _objectValues4.length; _i8++) {
	      var field = _objectValues4[_i8];
	      var fieldArgTypes = field.args.map(function (arg) {
	        return arg.type;
	      });
	      reducedMap = fieldArgTypes.reduce(typeMapReducer, reducedMap);
	      reducedMap = typeMapReducer(reducedMap, field.type);
	    }
	  }

	  if (isInputObjectType(namedType)) {
	    for (var _i10 = 0, _objectValues6 = objectValues(namedType.getFields()); _i10 < _objectValues6.length; _i10++) {
	      var _field = _objectValues6[_i10];
	      reducedMap = typeMapReducer(reducedMap, _field.type);
	    }
	  }

	  return reducedMap;
	}

	function typeMapDirectiveReducer(map, directive) {
	  // Directives are not validated until validateSchema() is called.
	  if (!isDirective(directive)) {
	    return map;
	  }

	  return directive.args.reduce(function (_map, arg) {
	    return typeMapReducer(_map, arg.type);
	  }, map);
	}

	/**
	 * Implements the "Type Validation" sub-sections of the specification's
	 * "Type System" section.
	 *
	 * Validation runs synchronously, returning an array of encountered errors, or
	 * an empty array if no errors were encountered and the Schema is valid.
	 */

	function validateSchema(schema) {
	  // First check to ensure the provided value is in fact a GraphQLSchema.
	  assertSchema(schema); // If this Schema has already been validated, return the previous results.

	  if (schema.__validationErrors) {
	    return schema.__validationErrors;
	  } // Validate the schema, producing a list of errors.


	  var context = new SchemaValidationContext(schema);
	  validateRootTypes(context);
	  validateDirectives(context);
	  validateTypes(context); // Persist the results of validation before returning to ensure validation
	  // does not run multiple times for this schema.

	  var errors = context.getErrors();
	  schema.__validationErrors = errors;
	  return errors;
	}
	/**
	 * Utility function which asserts a schema is valid by throwing an error if
	 * it is invalid.
	 */

	function assertValidSchema(schema) {
	  var errors = validateSchema(schema);

	  if (errors.length !== 0) {
	    throw new Error(errors.map(function (error) {
	      return error.message;
	    }).join('\n\n'));
	  }
	}

	var SchemaValidationContext =
	/*#__PURE__*/
	function () {
	  function SchemaValidationContext(schema) {
	    this._errors = [];
	    this.schema = schema;
	  }

	  var _proto = SchemaValidationContext.prototype;

	  _proto.reportError = function reportError(message, nodes) {
	    var _nodes = Array.isArray(nodes) ? nodes.filter(Boolean) : nodes;

	    this.addError(new GraphQLError(message, _nodes));
	  };

	  _proto.addError = function addError(error) {
	    this._errors.push(error);
	  };

	  _proto.getErrors = function getErrors() {
	    return this._errors;
	  };

	  return SchemaValidationContext;
	}();

	function validateRootTypes(context) {
	  var schema = context.schema;
	  var queryType = schema.getQueryType();

	  if (!queryType) {
	    context.reportError('Query root type must be provided.', schema.astNode);
	  } else if (!isObjectType(queryType)) {
	    context.reportError("Query root type must be Object type, it cannot be ".concat(inspect(queryType), "."), getOperationTypeNode(schema, queryType, 'query'));
	  }

	  var mutationType = schema.getMutationType();

	  if (mutationType && !isObjectType(mutationType)) {
	    context.reportError('Mutation root type must be Object type if provided, it cannot be ' + "".concat(inspect(mutationType), "."), getOperationTypeNode(schema, mutationType, 'mutation'));
	  }

	  var subscriptionType = schema.getSubscriptionType();

	  if (subscriptionType && !isObjectType(subscriptionType)) {
	    context.reportError('Subscription root type must be Object type if provided, it cannot be ' + "".concat(inspect(subscriptionType), "."), getOperationTypeNode(schema, subscriptionType, 'subscription'));
	  }
	}

	function getOperationTypeNode(schema, type, operation) {
	  var operationNodes = getAllSubNodes(schema, function (node) {
	    return node.operationTypes;
	  });

	  for (var _i2 = 0; _i2 < operationNodes.length; _i2++) {
	    var node = operationNodes[_i2];

	    if (node.operation === operation) {
	      return node.type;
	    }
	  }

	  return type.astNode;
	}

	function validateDirectives(context) {
	  for (var _i4 = 0, _context$schema$getDi2 = context.schema.getDirectives(); _i4 < _context$schema$getDi2.length; _i4++) {
	    var directive = _context$schema$getDi2[_i4];

	    // Ensure all directives are in fact GraphQL directives.
	    if (!isDirective(directive)) {
	      context.reportError("Expected directive but got: ".concat(inspect(directive), "."), directive && directive.astNode);
	      continue;
	    } // Ensure they are named correctly.


	    validateName(context, directive); // TODO: Ensure proper locations.
	    // Ensure the arguments are valid.

	    var argNames = Object.create(null);

	    var _loop = function _loop(_i6, _directive$args2) {
	      var arg = _directive$args2[_i6];
	      var argName = arg.name; // Ensure they are named correctly.

	      validateName(context, arg); // Ensure they are unique per directive.

	      if (argNames[argName]) {
	        context.reportError("Argument @".concat(directive.name, "(").concat(argName, ":) can only be defined once."), directive.astNode && directive.args.filter(function (_ref) {
	          var name = _ref.name;
	          return name === argName;
	        }).map(function (_ref2) {
	          var astNode = _ref2.astNode;
	          return astNode;
	        }));
	        return "continue";
	      }

	      argNames[argName] = true; // Ensure the type is an input type.

	      if (!isInputType(arg.type)) {
	        context.reportError("The type of @".concat(directive.name, "(").concat(argName, ":) must be Input Type ") + "but got: ".concat(inspect(arg.type), "."), arg.astNode);
	      }
	    };

	    for (var _i6 = 0, _directive$args2 = directive.args; _i6 < _directive$args2.length; _i6++) {
	      var _ret = _loop(_i6, _directive$args2);

	      if (_ret === "continue") continue;
	    }
	  }
	}

	function validateName(context, node) {
	  // If a schema explicitly allows some legacy name which is no longer valid,
	  // allow it to be assumed valid.
	  if (context.schema.__allowedLegacyNames.indexOf(node.name) !== -1) {
	    return;
	  } // Ensure names are valid, however introspection types opt out.


	  var error = isValidNameError(node.name, node.astNode || undefined);

	  if (error) {
	    context.addError(error);
	  }
	}

	function validateTypes(context) {
	  var validateInputObjectCircularRefs = createInputObjectCircularRefsValidator(context);
	  var typeMap = context.schema.getTypeMap();

	  for (var _i8 = 0, _objectValues2 = objectValues(typeMap); _i8 < _objectValues2.length; _i8++) {
	    var type = _objectValues2[_i8];

	    // Ensure all provided types are in fact GraphQL type.
	    if (!isNamedType(type)) {
	      context.reportError("Expected GraphQL named type but got: ".concat(inspect(type), "."), type && type.astNode);
	      continue;
	    } // Ensure it is named correctly (excluding introspection types).


	    if (!isIntrospectionType(type)) {
	      validateName(context, type);
	    }

	    if (isObjectType(type)) {
	      // Ensure fields are valid
	      validateFields(context, type); // Ensure objects implement the interfaces they claim to.

	      validateObjectInterfaces(context, type);
	    } else if (isInterfaceType(type)) {
	      // Ensure fields are valid.
	      validateFields(context, type);
	    } else if (isUnionType(type)) {
	      // Ensure Unions include valid member types.
	      validateUnionMembers(context, type);
	    } else if (isEnumType(type)) {
	      // Ensure Enums have valid values.
	      validateEnumValues(context, type);
	    } else if (isInputObjectType(type)) {
	      // Ensure Input Object fields are valid.
	      validateInputFields(context, type); // Ensure Input Objects do not contain non-nullable circular references

	      validateInputObjectCircularRefs(type);
	    }
	  }
	}

	function validateFields(context, type) {
	  var fields = objectValues(type.getFields()); // Objects and Interfaces both must define one or more fields.

	  if (fields.length === 0) {
	    context.reportError("Type ".concat(type.name, " must define one or more fields."), getAllNodes(type));
	  }

	  for (var _i10 = 0; _i10 < fields.length; _i10++) {
	    var field = fields[_i10];
	    // Ensure they are named correctly.
	    validateName(context, field); // Ensure the type is an output type

	    if (!isOutputType(field.type)) {
	      context.reportError("The type of ".concat(type.name, ".").concat(field.name, " must be Output Type ") + "but got: ".concat(inspect(field.type), "."), field.astNode && field.astNode.type);
	    } // Ensure the arguments are valid


	    var argNames = Object.create(null);

	    var _loop2 = function _loop2(_i12, _field$args2) {
	      var arg = _field$args2[_i12];
	      var argName = arg.name; // Ensure they are named correctly.

	      validateName(context, arg); // Ensure they are unique per field.

	      if (argNames[argName]) {
	        context.reportError("Field argument ".concat(type.name, ".").concat(field.name, "(").concat(argName, ":) can only be defined once."), field.args.filter(function (_ref3) {
	          var name = _ref3.name;
	          return name === argName;
	        }).map(function (_ref4) {
	          var astNode = _ref4.astNode;
	          return astNode;
	        }));
	      }

	      argNames[argName] = true; // Ensure the type is an input type

	      if (!isInputType(arg.type)) {
	        context.reportError("The type of ".concat(type.name, ".").concat(field.name, "(").concat(argName, ":) must be Input ") + "Type but got: ".concat(inspect(arg.type), "."), arg.astNode && arg.astNode.type);
	      }
	    };

	    for (var _i12 = 0, _field$args2 = field.args; _i12 < _field$args2.length; _i12++) {
	      _loop2(_i12, _field$args2);
	    }
	  }
	}

	function validateObjectInterfaces(context, object) {
	  var implementedTypeNames = Object.create(null);

	  for (var _i14 = 0, _object$getInterfaces2 = object.getInterfaces(); _i14 < _object$getInterfaces2.length; _i14++) {
	    var iface = _object$getInterfaces2[_i14];

	    if (!isInterfaceType(iface)) {
	      context.reportError("Type ".concat(inspect(object), " must only implement Interface types, ") + "it cannot implement ".concat(inspect(iface), "."), getAllImplementsInterfaceNodes(object, iface));
	      continue;
	    }

	    if (implementedTypeNames[iface.name]) {
	      context.reportError("Type ".concat(object.name, " can only implement ").concat(iface.name, " once."), getAllImplementsInterfaceNodes(object, iface));
	      continue;
	    }

	    implementedTypeNames[iface.name] = true;
	    validateObjectImplementsInterface(context, object, iface);
	  }
	}

	function validateObjectImplementsInterface(context, object, iface) {
	  var objectFieldMap = object.getFields();
	  var ifaceFieldMap = iface.getFields(); // Assert each interface field is implemented.

	  for (var _i16 = 0, _objectEntries2 = objectEntries(ifaceFieldMap); _i16 < _objectEntries2.length; _i16++) {
	    var _ref6 = _objectEntries2[_i16];
	    var fieldName = _ref6[0];
	    var ifaceField = _ref6[1];
	    var objectField = objectFieldMap[fieldName]; // Assert interface field exists on object.

	    if (!objectField) {
	      context.reportError("Interface field ".concat(iface.name, ".").concat(fieldName, " expected but ").concat(object.name, " does not provide it."), [ifaceField.astNode].concat(getAllNodes(object)));
	      continue;
	    } // Assert interface field type is satisfied by object field type, by being
	    // a valid subtype. (covariant)


	    if (!isTypeSubTypeOf(context.schema, objectField.type, ifaceField.type)) {
	      context.reportError("Interface field ".concat(iface.name, ".").concat(fieldName, " expects type ") + "".concat(inspect(ifaceField.type), " but ").concat(object.name, ".").concat(fieldName, " ") + "is type ".concat(inspect(objectField.type), "."), [ifaceField.astNode && ifaceField.astNode.type, objectField.astNode && objectField.astNode.type]);
	    } // Assert each interface field arg is implemented.


	    var _loop3 = function _loop3(_i18, _ifaceField$args2) {
	      var ifaceArg = _ifaceField$args2[_i18];
	      var argName = ifaceArg.name;
	      var objectArg = find(objectField.args, function (arg) {
	        return arg.name === argName;
	      }); // Assert interface field arg exists on object field.

	      if (!objectArg) {
	        context.reportError("Interface field argument ".concat(iface.name, ".").concat(fieldName, "(").concat(argName, ":) expected but ").concat(object.name, ".").concat(fieldName, " does not provide it."), [ifaceArg.astNode, objectField.astNode]);
	        return "continue";
	      } // Assert interface field arg type matches object field arg type.
	      // (invariant)
	      // TODO: change to contravariant?


	      if (!isEqualType(ifaceArg.type, objectArg.type)) {
	        context.reportError("Interface field argument ".concat(iface.name, ".").concat(fieldName, "(").concat(argName, ":) ") + "expects type ".concat(inspect(ifaceArg.type), " but ") + "".concat(object.name, ".").concat(fieldName, "(").concat(argName, ":) is type ") + "".concat(inspect(objectArg.type), "."), [ifaceArg.astNode && ifaceArg.astNode.type, objectArg.astNode && objectArg.astNode.type]);
	      } // TODO: validate default values?

	    };

	    for (var _i18 = 0, _ifaceField$args2 = ifaceField.args; _i18 < _ifaceField$args2.length; _i18++) {
	      var _ret2 = _loop3(_i18, _ifaceField$args2);

	      if (_ret2 === "continue") continue;
	    } // Assert additional arguments must not be required.


	    var _loop4 = function _loop4(_i20, _objectField$args2) {
	      var objectArg = _objectField$args2[_i20];
	      var argName = objectArg.name;
	      var ifaceArg = find(ifaceField.args, function (arg) {
	        return arg.name === argName;
	      });

	      if (!ifaceArg && isRequiredArgument(objectArg)) {
	        context.reportError("Object field ".concat(object.name, ".").concat(fieldName, " includes required argument ").concat(argName, " that is missing from the Interface field ").concat(iface.name, ".").concat(fieldName, "."), [objectArg.astNode, ifaceField.astNode]);
	      }
	    };

	    for (var _i20 = 0, _objectField$args2 = objectField.args; _i20 < _objectField$args2.length; _i20++) {
	      _loop4(_i20, _objectField$args2);
	    }
	  }
	}

	function validateUnionMembers(context, union) {
	  var memberTypes = union.getTypes();

	  if (memberTypes.length === 0) {
	    context.reportError("Union type ".concat(union.name, " must define one or more member types."), getAllNodes(union));
	  }

	  var includedTypeNames = Object.create(null);

	  for (var _i22 = 0; _i22 < memberTypes.length; _i22++) {
	    var memberType = memberTypes[_i22];

	    if (includedTypeNames[memberType.name]) {
	      context.reportError("Union type ".concat(union.name, " can only include type ").concat(memberType.name, " once."), getUnionMemberTypeNodes(union, memberType.name));
	      continue;
	    }

	    includedTypeNames[memberType.name] = true;

	    if (!isObjectType(memberType)) {
	      context.reportError("Union type ".concat(union.name, " can only include Object types, ") + "it cannot include ".concat(inspect(memberType), "."), getUnionMemberTypeNodes(union, String(memberType)));
	    }
	  }
	}

	function validateEnumValues(context, enumType) {
	  var enumValues = enumType.getValues();

	  if (enumValues.length === 0) {
	    context.reportError("Enum type ".concat(enumType.name, " must define one or more values."), getAllNodes(enumType));
	  }

	  for (var _i24 = 0; _i24 < enumValues.length; _i24++) {
	    var enumValue = enumValues[_i24];
	    var valueName = enumValue.name; // Ensure valid name.

	    validateName(context, enumValue);

	    if (valueName === 'true' || valueName === 'false' || valueName === 'null') {
	      context.reportError("Enum type ".concat(enumType.name, " cannot include value: ").concat(valueName, "."), enumValue.astNode);
	    }
	  }
	}

	function validateInputFields(context, inputObj) {
	  var fields = objectValues(inputObj.getFields());

	  if (fields.length === 0) {
	    context.reportError("Input Object type ".concat(inputObj.name, " must define one or more fields."), getAllNodes(inputObj));
	  } // Ensure the arguments are valid


	  for (var _i26 = 0; _i26 < fields.length; _i26++) {
	    var field = fields[_i26];
	    // Ensure they are named correctly.
	    validateName(context, field); // Ensure the type is an input type

	    if (!isInputType(field.type)) {
	      context.reportError("The type of ".concat(inputObj.name, ".").concat(field.name, " must be Input Type ") + "but got: ".concat(inspect(field.type), "."), field.astNode && field.astNode.type);
	    }
	  }
	}

	function createInputObjectCircularRefsValidator(context) {
	  // Modified copy of algorithm from 'src/validation/rules/NoFragmentCycles.js'.
	  // Tracks already visited types to maintain O(N) and to ensure that cycles
	  // are not redundantly reported.
	  var visitedTypes = Object.create(null); // Array of types nodes used to produce meaningful errors

	  var fieldPath = []; // Position in the type path

	  var fieldPathIndexByTypeName = Object.create(null);
	  return detectCycleRecursive; // This does a straight-forward DFS to find cycles.
	  // It does not terminate when a cycle was found but continues to explore
	  // the graph to find all possible cycles.

	  function detectCycleRecursive(inputObj) {
	    if (visitedTypes[inputObj.name]) {
	      return;
	    }

	    visitedTypes[inputObj.name] = true;
	    fieldPathIndexByTypeName[inputObj.name] = fieldPath.length;
	    var fields = objectValues(inputObj.getFields());

	    for (var _i28 = 0; _i28 < fields.length; _i28++) {
	      var field = fields[_i28];

	      if (isNonNullType(field.type) && isInputObjectType(field.type.ofType)) {
	        var fieldType = field.type.ofType;
	        var cycleIndex = fieldPathIndexByTypeName[fieldType.name];
	        fieldPath.push(field);

	        if (cycleIndex === undefined) {
	          detectCycleRecursive(fieldType);
	        } else {
	          var cyclePath = fieldPath.slice(cycleIndex);
	          var pathStr = cyclePath.map(function (fieldObj) {
	            return fieldObj.name;
	          }).join('.');
	          context.reportError("Cannot reference Input Object \"".concat(fieldType.name, "\" within itself through a series of non-null fields: \"").concat(pathStr, "\"."), cyclePath.map(function (fieldObj) {
	            return fieldObj.astNode;
	          }));
	        }

	        fieldPath.pop();
	      }
	    }

	    fieldPathIndexByTypeName[inputObj.name] = undefined;
	  }
	}

	function getAllNodes(object) {
	  var astNode = object.astNode,
	      extensionASTNodes = object.extensionASTNodes;
	  return astNode ? extensionASTNodes ? [astNode].concat(extensionASTNodes) : [astNode] : extensionASTNodes || [];
	}

	function getAllSubNodes(object, getter) {
	  return flatMap$1(getAllNodes(object), function (item) {
	    return getter(item) || [];
	  });
	}

	function getAllImplementsInterfaceNodes(type, iface) {
	  return getAllSubNodes(type, function (typeNode) {
	    return typeNode.interfaces;
	  }).filter(function (ifaceNode) {
	    return ifaceNode.name.value === iface.name;
	  });
	}

	function getUnionMemberTypeNodes(union, typeName) {
	  return getAllSubNodes(union, function (unionNode) {
	    return unionNode.types;
	  }).filter(function (typeNode) {
	    return typeNode.name.value === typeName;
	  });
	}

	/**
	 * Given a Schema and an AST node describing a type, return a GraphQLType
	 * definition which applies to that type. For example, if provided the parsed
	 * AST node for `[User]`, a GraphQLList instance will be returned, containing
	 * the type called "User" found in the schema. If a type called "User" is not
	 * found in the schema, then undefined will be returned.
	 */

	/* eslint-disable no-redeclare */

	function typeFromAST(schema, typeNode) {
	  /* eslint-enable no-redeclare */
	  var innerType;

	  if (typeNode.kind === Kind.LIST_TYPE) {
	    innerType = typeFromAST(schema, typeNode.type);
	    return innerType && GraphQLList(innerType);
	  }

	  if (typeNode.kind === Kind.NON_NULL_TYPE) {
	    innerType = typeFromAST(schema, typeNode.type);
	    return innerType && GraphQLNonNull(innerType);
	  }

	  /* istanbul ignore else */
	  if (typeNode.kind === Kind.NAMED_TYPE) {
	    return schema.getType(typeNode.name.value);
	  } // Not reachable. All possible type nodes have been considered.


	  /* istanbul ignore next */
	  invariant(false, 'Unexpected type node: ' + inspect(typeNode));
	}

	/**
	 * TypeInfo is a utility class which, given a GraphQL schema, can keep track
	 * of the current field and type definitions at any point in a GraphQL document
	 * AST during a recursive descent by calling `enter(node)` and `leave(node)`.
	 */

	var TypeInfo =
	/*#__PURE__*/
	function () {
	  function TypeInfo(schema, // NOTE: this experimental optional second parameter is only needed in order
	  // to support non-spec-compliant codebases. You should never need to use it.
	  // It may disappear in the future.
	  getFieldDefFn, // Initial type may be provided in rare cases to facilitate traversals
	  // beginning somewhere other than documents.
	  initialType) {
	    this._schema = schema;
	    this._typeStack = [];
	    this._parentTypeStack = [];
	    this._inputTypeStack = [];
	    this._fieldDefStack = [];
	    this._defaultValueStack = [];
	    this._directive = null;
	    this._argument = null;
	    this._enumValue = null;
	    this._getFieldDef = getFieldDefFn || getFieldDef;

	    if (initialType) {
	      if (isInputType(initialType)) {
	        this._inputTypeStack.push(initialType);
	      }

	      if (isCompositeType(initialType)) {
	        this._parentTypeStack.push(initialType);
	      }

	      if (isOutputType(initialType)) {
	        this._typeStack.push(initialType);
	      }
	    }
	  }

	  var _proto = TypeInfo.prototype;

	  _proto.getType = function getType() {
	    if (this._typeStack.length > 0) {
	      return this._typeStack[this._typeStack.length - 1];
	    }
	  };

	  _proto.getParentType = function getParentType() {
	    if (this._parentTypeStack.length > 0) {
	      return this._parentTypeStack[this._parentTypeStack.length - 1];
	    }
	  };

	  _proto.getInputType = function getInputType() {
	    if (this._inputTypeStack.length > 0) {
	      return this._inputTypeStack[this._inputTypeStack.length - 1];
	    }
	  };

	  _proto.getParentInputType = function getParentInputType() {
	    if (this._inputTypeStack.length > 1) {
	      return this._inputTypeStack[this._inputTypeStack.length - 2];
	    }
	  };

	  _proto.getFieldDef = function getFieldDef() {
	    if (this._fieldDefStack.length > 0) {
	      return this._fieldDefStack[this._fieldDefStack.length - 1];
	    }
	  };

	  _proto.getDefaultValue = function getDefaultValue() {
	    if (this._defaultValueStack.length > 0) {
	      return this._defaultValueStack[this._defaultValueStack.length - 1];
	    }
	  };

	  _proto.getDirective = function getDirective() {
	    return this._directive;
	  };

	  _proto.getArgument = function getArgument() {
	    return this._argument;
	  };

	  _proto.getEnumValue = function getEnumValue() {
	    return this._enumValue;
	  };

	  _proto.enter = function enter(node) {
	    var schema = this._schema; // Note: many of the types below are explicitly typed as "mixed" to drop
	    // any assumptions of a valid schema to ensure runtime types are properly
	    // checked before continuing since TypeInfo is used as part of validation
	    // which occurs before guarantees of schema and document validity.

	    switch (node.kind) {
	      case Kind.SELECTION_SET:
	        {
	          var namedType = getNamedType(this.getType());

	          this._parentTypeStack.push(isCompositeType(namedType) ? namedType : undefined);

	          break;
	        }

	      case Kind.FIELD:
	        {
	          var parentType = this.getParentType();
	          var fieldDef;
	          var fieldType;

	          if (parentType) {
	            fieldDef = this._getFieldDef(schema, parentType, node);

	            if (fieldDef) {
	              fieldType = fieldDef.type;
	            }
	          }

	          this._fieldDefStack.push(fieldDef);

	          this._typeStack.push(isOutputType(fieldType) ? fieldType : undefined);

	          break;
	        }

	      case Kind.DIRECTIVE:
	        this._directive = schema.getDirective(node.name.value);
	        break;

	      case Kind.OPERATION_DEFINITION:
	        {
	          var type;

	          if (node.operation === 'query') {
	            type = schema.getQueryType();
	          } else if (node.operation === 'mutation') {
	            type = schema.getMutationType();
	          } else if (node.operation === 'subscription') {
	            type = schema.getSubscriptionType();
	          }

	          this._typeStack.push(isObjectType(type) ? type : undefined);

	          break;
	        }

	      case Kind.INLINE_FRAGMENT:
	      case Kind.FRAGMENT_DEFINITION:
	        {
	          var typeConditionAST = node.typeCondition;
	          var outputType = typeConditionAST ? typeFromAST(schema, typeConditionAST) : getNamedType(this.getType());

	          this._typeStack.push(isOutputType(outputType) ? outputType : undefined);

	          break;
	        }

	      case Kind.VARIABLE_DEFINITION:
	        {
	          var inputType = typeFromAST(schema, node.type);

	          this._inputTypeStack.push(isInputType(inputType) ? inputType : undefined);

	          break;
	        }

	      case Kind.ARGUMENT:
	        {
	          var argDef;
	          var argType;
	          var fieldOrDirective = this.getDirective() || this.getFieldDef();

	          if (fieldOrDirective) {
	            argDef = find(fieldOrDirective.args, function (arg) {
	              return arg.name === node.name.value;
	            });

	            if (argDef) {
	              argType = argDef.type;
	            }
	          }

	          this._argument = argDef;

	          this._defaultValueStack.push(argDef ? argDef.defaultValue : undefined);

	          this._inputTypeStack.push(isInputType(argType) ? argType : undefined);

	          break;
	        }

	      case Kind.LIST:
	        {
	          var listType = getNullableType(this.getInputType());
	          var itemType = isListType(listType) ? listType.ofType : listType; // List positions never have a default value.

	          this._defaultValueStack.push(undefined);

	          this._inputTypeStack.push(isInputType(itemType) ? itemType : undefined);

	          break;
	        }

	      case Kind.OBJECT_FIELD:
	        {
	          var objectType = getNamedType(this.getInputType());
	          var inputFieldType;
	          var inputField;

	          if (isInputObjectType(objectType)) {
	            inputField = objectType.getFields()[node.name.value];

	            if (inputField) {
	              inputFieldType = inputField.type;
	            }
	          }

	          this._defaultValueStack.push(inputField ? inputField.defaultValue : undefined);

	          this._inputTypeStack.push(isInputType(inputFieldType) ? inputFieldType : undefined);

	          break;
	        }

	      case Kind.ENUM:
	        {
	          var enumType = getNamedType(this.getInputType());
	          var enumValue;

	          if (isEnumType(enumType)) {
	            enumValue = enumType.getValue(node.value);
	          }

	          this._enumValue = enumValue;
	          break;
	        }
	    }
	  };

	  _proto.leave = function leave(node) {
	    switch (node.kind) {
	      case Kind.SELECTION_SET:
	        this._parentTypeStack.pop();

	        break;

	      case Kind.FIELD:
	        this._fieldDefStack.pop();

	        this._typeStack.pop();

	        break;

	      case Kind.DIRECTIVE:
	        this._directive = null;
	        break;

	      case Kind.OPERATION_DEFINITION:
	      case Kind.INLINE_FRAGMENT:
	      case Kind.FRAGMENT_DEFINITION:
	        this._typeStack.pop();

	        break;

	      case Kind.VARIABLE_DEFINITION:
	        this._inputTypeStack.pop();

	        break;

	      case Kind.ARGUMENT:
	        this._argument = null;

	        this._defaultValueStack.pop();

	        this._inputTypeStack.pop();

	        break;

	      case Kind.LIST:
	      case Kind.OBJECT_FIELD:
	        this._defaultValueStack.pop();

	        this._inputTypeStack.pop();

	        break;

	      case Kind.ENUM:
	        this._enumValue = null;
	        break;
	    }
	  };

	  return TypeInfo;
	}();
	/**
	 * Not exactly the same as the executor's definition of getFieldDef, in this
	 * statically evaluated environment we do not always have an Object type,
	 * and need to handle Interface and Union types.
	 */

	function getFieldDef(schema, parentType, fieldNode) {
	  var name = fieldNode.name.value;

	  if (name === SchemaMetaFieldDef.name && schema.getQueryType() === parentType) {
	    return SchemaMetaFieldDef;
	  }

	  if (name === TypeMetaFieldDef.name && schema.getQueryType() === parentType) {
	    return TypeMetaFieldDef;
	  }

	  if (name === TypeNameMetaFieldDef.name && isCompositeType(parentType)) {
	    return TypeNameMetaFieldDef;
	  }

	  if (isObjectType(parentType) || isInterfaceType(parentType)) {
	    return parentType.getFields()[name];
	  }
	}

	function isDefinitionNode(node) {
	  return isExecutableDefinitionNode(node) || isTypeSystemDefinitionNode(node) || isTypeSystemExtensionNode(node);
	}
	function isExecutableDefinitionNode(node) {
	  return node.kind === Kind.OPERATION_DEFINITION || node.kind === Kind.FRAGMENT_DEFINITION;
	}
	function isSelectionNode(node) {
	  return node.kind === Kind.FIELD || node.kind === Kind.FRAGMENT_SPREAD || node.kind === Kind.INLINE_FRAGMENT;
	}
	function isValueNode(node) {
	  return node.kind === Kind.VARIABLE || node.kind === Kind.INT || node.kind === Kind.FLOAT || node.kind === Kind.STRING || node.kind === Kind.BOOLEAN || node.kind === Kind.NULL || node.kind === Kind.ENUM || node.kind === Kind.LIST || node.kind === Kind.OBJECT;
	}
	function isTypeNode(node) {
	  return node.kind === Kind.NAMED_TYPE || node.kind === Kind.LIST_TYPE || node.kind === Kind.NON_NULL_TYPE;
	}
	function isTypeSystemDefinitionNode(node) {
	  return node.kind === Kind.SCHEMA_DEFINITION || isTypeDefinitionNode(node) || node.kind === Kind.DIRECTIVE_DEFINITION;
	}
	function isTypeDefinitionNode(node) {
	  return node.kind === Kind.SCALAR_TYPE_DEFINITION || node.kind === Kind.OBJECT_TYPE_DEFINITION || node.kind === Kind.INTERFACE_TYPE_DEFINITION || node.kind === Kind.UNION_TYPE_DEFINITION || node.kind === Kind.ENUM_TYPE_DEFINITION || node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION;
	}
	function isTypeSystemExtensionNode(node) {
	  return node.kind === Kind.SCHEMA_EXTENSION || isTypeExtensionNode(node);
	}
	function isTypeExtensionNode(node) {
	  return node.kind === Kind.SCALAR_TYPE_EXTENSION || node.kind === Kind.OBJECT_TYPE_EXTENSION || node.kind === Kind.INTERFACE_TYPE_EXTENSION || node.kind === Kind.UNION_TYPE_EXTENSION || node.kind === Kind.ENUM_TYPE_EXTENSION || node.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION;
	}

	function nonExecutableDefinitionMessage(defName) {
	  return "The ".concat(defName, " definition is not executable.");
	}
	/**
	 * Executable definitions
	 *
	 * A GraphQL document is only valid for execution if all definitions are either
	 * operation or fragment definitions.
	 */

	function ExecutableDefinitions(context) {
	  return {
	    Document: function Document(node) {
	      for (var _i2 = 0, _node$definitions2 = node.definitions; _i2 < _node$definitions2.length; _i2++) {
	        var definition = _node$definitions2[_i2];

	        if (!isExecutableDefinitionNode(definition)) {
	          context.reportError(new GraphQLError(nonExecutableDefinitionMessage(definition.kind === Kind.SCHEMA_DEFINITION || definition.kind === Kind.SCHEMA_EXTENSION ? 'schema' : definition.name.value), definition));
	        }
	      }

	      return false;
	    }
	  };
	}

	function duplicateOperationNameMessage(operationName) {
	  return "There can be only one operation named \"".concat(operationName, "\".");
	}
	/**
	 * Unique operation names
	 *
	 * A GraphQL document is only valid if all defined operations have unique names.
	 */

	function UniqueOperationNames(context) {
	  var knownOperationNames = Object.create(null);
	  return {
	    OperationDefinition: function OperationDefinition(node) {
	      var operationName = node.name;

	      if (operationName) {
	        if (knownOperationNames[operationName.value]) {
	          context.reportError(new GraphQLError(duplicateOperationNameMessage(operationName.value), [knownOperationNames[operationName.value], operationName]));
	        } else {
	          knownOperationNames[operationName.value] = operationName;
	        }
	      }

	      return false;
	    },
	    FragmentDefinition: function FragmentDefinition() {
	      return false;
	    }
	  };
	}

	function anonOperationNotAloneMessage() {
	  return 'This anonymous operation must be the only defined operation.';
	}
	/**
	 * Lone anonymous operation
	 *
	 * A GraphQL document is only valid if when it contains an anonymous operation
	 * (the query short-hand) that it contains only that one operation definition.
	 */

	function LoneAnonymousOperation(context) {
	  var operationCount = 0;
	  return {
	    Document: function Document(node) {
	      operationCount = node.definitions.filter(function (definition) {
	        return definition.kind === Kind.OPERATION_DEFINITION;
	      }).length;
	    },
	    OperationDefinition: function OperationDefinition(node) {
	      if (!node.name && operationCount > 1) {
	        context.reportError(new GraphQLError(anonOperationNotAloneMessage(), node));
	      }
	    }
	  };
	}

	function singleFieldOnlyMessage(name) {
	  return name ? "Subscription \"".concat(name, "\" must select only one top level field.") : 'Anonymous Subscription must select only one top level field.';
	}
	/**
	 * Subscriptions must only include one field.
	 *
	 * A GraphQL subscription is valid only if it contains a single root field.
	 */

	function SingleFieldSubscriptions(context) {
	  return {
	    OperationDefinition: function OperationDefinition(node) {
	      if (node.operation === 'subscription') {
	        if (node.selectionSet.selections.length !== 1) {
	          context.reportError(new GraphQLError(singleFieldOnlyMessage(node.name && node.name.value), node.selectionSet.selections.slice(1)));
	        }
	      }
	    }
	  };
	}

	var MAX_SUGGESTIONS = 5;
	/**
	 * Given [ A, B, C ] return ' Did you mean A, B, or C?'.
	 */

	// eslint-disable-next-line no-redeclare
	function didYouMean(firstArg, secondArg) {
	  var _ref = typeof firstArg === 'string' ? [firstArg, secondArg] : [undefined, firstArg],
	      subMessage = _ref[0],
	      suggestions = _ref[1];

	  var message = ' Did you mean ';

	  if (subMessage) {
	    message += subMessage + ' ';
	  }

	  switch (suggestions.length) {
	    case 0:
	      return '';

	    case 1:
	      return message + suggestions[0] + '?';

	    case 2:
	      return message + suggestions[0] + ' or ' + suggestions[1] + '?';
	  }

	  var selected = suggestions.slice(0, MAX_SUGGESTIONS);
	  var lastItem = selected.pop();
	  return message + selected.join(', ') + ', or ' + lastItem + '?';
	}

	/**
	 * Given an invalid input string and a list of valid options, returns a filtered
	 * list of valid options sorted based on their similarity with the input.
	 */
	function suggestionList(input, options) {
	  var optionsByDistance = Object.create(null);
	  var inputThreshold = input.length / 2;

	  for (var _i2 = 0; _i2 < options.length; _i2++) {
	    var option = options[_i2];
	    var distance = lexicalDistance(input, option);
	    var threshold = Math.max(inputThreshold, option.length / 2, 1);

	    if (distance <= threshold) {
	      optionsByDistance[option] = distance;
	    }
	  }

	  return Object.keys(optionsByDistance).sort(function (a, b) {
	    return optionsByDistance[a] - optionsByDistance[b];
	  });
	}
	/**
	 * Computes the lexical distance between strings A and B.
	 *
	 * The "distance" between two strings is given by counting the minimum number
	 * of edits needed to transform string A into string B. An edit can be an
	 * insertion, deletion, or substitution of a single character, or a swap of two
	 * adjacent characters.
	 *
	 * Includes a custom alteration from Damerau-Levenshtein to treat case changes
	 * as a single edit which helps identify mis-cased values with an edit distance
	 * of 1.
	 *
	 * This distance can be useful for detecting typos in input or sorting
	 *
	 * @param {string} a
	 * @param {string} b
	 * @return {int} distance in number of edits
	 */

	function lexicalDistance(aStr, bStr) {
	  if (aStr === bStr) {
	    return 0;
	  }

	  var d = [];
	  var a = aStr.toLowerCase();
	  var b = bStr.toLowerCase();
	  var aLength = a.length;
	  var bLength = b.length; // Any case change counts as a single edit

	  if (a === b) {
	    return 1;
	  }

	  for (var i = 0; i <= aLength; i++) {
	    d[i] = [i];
	  }

	  for (var j = 1; j <= bLength; j++) {
	    d[0][j] = j;
	  }

	  for (var _i3 = 1; _i3 <= aLength; _i3++) {
	    for (var _j = 1; _j <= bLength; _j++) {
	      var cost = a[_i3 - 1] === b[_j - 1] ? 0 : 1;
	      d[_i3][_j] = Math.min(d[_i3 - 1][_j] + 1, d[_i3][_j - 1] + 1, d[_i3 - 1][_j - 1] + cost);

	      if (_i3 > 1 && _j > 1 && a[_i3 - 1] === b[_j - 2] && a[_i3 - 2] === b[_j - 1]) {
	        d[_i3][_j] = Math.min(d[_i3][_j], d[_i3 - 2][_j - 2] + cost);
	      }
	    }
	  }

	  return d[aLength][bLength];
	}

	function unknownTypeMessage(typeName, suggestedTypes) {
	  return "Unknown type \"".concat(typeName, "\".") + didYouMean(suggestedTypes.map(function (x) {
	    return "\"".concat(x, "\"");
	  }));
	}
	/**
	 * Known type names
	 *
	 * A GraphQL document is only valid if referenced types (specifically
	 * variable definitions and fragment conditions) are defined by the type schema.
	 */

	function KnownTypeNames(context) {
	  var schema = context.getSchema();
	  var existingTypesMap = schema ? schema.getTypeMap() : Object.create(null);
	  var definedTypes = Object.create(null);

	  for (var _i2 = 0, _context$getDocument$2 = context.getDocument().definitions; _i2 < _context$getDocument$2.length; _i2++) {
	    var def = _context$getDocument$2[_i2];

	    if (isTypeDefinitionNode(def)) {
	      definedTypes[def.name.value] = true;
	    }
	  }

	  var typeNames = Object.keys(existingTypesMap).concat(Object.keys(definedTypes));
	  return {
	    NamedType: function NamedType(node, _1, parent, _2, ancestors) {
	      var typeName = node.name.value;

	      if (!existingTypesMap[typeName] && !definedTypes[typeName]) {
	        var definitionNode = ancestors[2] || parent;
	        var isSDL = isSDLNode(definitionNode);

	        if (isSDL && isSpecifiedScalarName(typeName)) {
	          return;
	        }

	        var suggestedTypes = suggestionList(typeName, isSDL ? specifiedScalarsNames.concat(typeNames) : typeNames);
	        context.reportError(new GraphQLError(unknownTypeMessage(typeName, suggestedTypes), node));
	      }
	    }
	  };
	}
	var specifiedScalarsNames = specifiedScalarTypes.map(function (type) {
	  return type.name;
	});

	function isSpecifiedScalarName(typeName) {
	  return specifiedScalarsNames.indexOf(typeName) !== -1;
	}

	function isSDLNode(value) {
	  return Boolean(value && !Array.isArray(value) && (isTypeSystemDefinitionNode(value) || isTypeSystemExtensionNode(value)));
	}

	function inlineFragmentOnNonCompositeErrorMessage(type) {
	  return "Fragment cannot condition on non composite type \"".concat(type, "\".");
	}
	function fragmentOnNonCompositeErrorMessage(fragName, type) {
	  return "Fragment \"".concat(fragName, "\" cannot condition on non composite type \"").concat(type, "\".");
	}
	/**
	 * Fragments on composite type
	 *
	 * Fragments use a type condition to determine if they apply, since fragments
	 * can only be spread into a composite type (object, interface, or union), the
	 * type condition must also be a composite type.
	 */

	function FragmentsOnCompositeTypes(context) {
	  return {
	    InlineFragment: function InlineFragment(node) {
	      var typeCondition = node.typeCondition;

	      if (typeCondition) {
	        var type = typeFromAST(context.getSchema(), typeCondition);

	        if (type && !isCompositeType(type)) {
	          context.reportError(new GraphQLError(inlineFragmentOnNonCompositeErrorMessage(print(typeCondition)), typeCondition));
	        }
	      }
	    },
	    FragmentDefinition: function FragmentDefinition(node) {
	      var type = typeFromAST(context.getSchema(), node.typeCondition);

	      if (type && !isCompositeType(type)) {
	        context.reportError(new GraphQLError(fragmentOnNonCompositeErrorMessage(node.name.value, print(node.typeCondition)), node.typeCondition));
	      }
	    }
	  };
	}

	function nonInputTypeOnVarMessage(variableName, typeName) {
	  return "Variable \"$".concat(variableName, "\" cannot be non-input type \"").concat(typeName, "\".");
	}
	/**
	 * Variables are input types
	 *
	 * A GraphQL operation is only valid if all the variables it defines are of
	 * input types (scalar, enum, or input object).
	 */

	function VariablesAreInputTypes(context) {
	  return {
	    VariableDefinition: function VariableDefinition(node) {
	      var type = typeFromAST(context.getSchema(), node.type); // If the variable type is not an input type, return an error.

	      if (type && !isInputType(type)) {
	        var variableName = node.variable.name.value;
	        context.reportError(new GraphQLError(nonInputTypeOnVarMessage(variableName, print(node.type)), node.type));
	      }
	    }
	  };
	}

	function noSubselectionAllowedMessage(fieldName, type) {
	  return "Field \"".concat(fieldName, "\" must not have a selection since type \"").concat(type, "\" has no subfields.");
	}
	function requiredSubselectionMessage(fieldName, type) {
	  return "Field \"".concat(fieldName, "\" of type \"").concat(type, "\" must have a selection of subfields. Did you mean \"").concat(fieldName, " { ... }\"?");
	}
	/**
	 * Scalar leafs
	 *
	 * A GraphQL document is valid only if all leaf fields (fields without
	 * sub selections) are of scalar or enum types.
	 */

	function ScalarLeafs(context) {
	  return {
	    Field: function Field(node) {
	      var type = context.getType();
	      var selectionSet = node.selectionSet;

	      if (type) {
	        if (isLeafType(getNamedType(type))) {
	          if (selectionSet) {
	            context.reportError(new GraphQLError(noSubselectionAllowedMessage(node.name.value, inspect(type)), selectionSet));
	          }
	        } else if (!selectionSet) {
	          context.reportError(new GraphQLError(requiredSubselectionMessage(node.name.value, inspect(type)), node));
	        }
	      }
	    }
	  };
	}

	function undefinedFieldMessage(fieldName, type, suggestedTypeNames, suggestedFieldNames) {
	  var quotedTypeNames = suggestedTypeNames.map(function (x) {
	    return "\"".concat(x, "\"");
	  });
	  var quotedFieldNames = suggestedFieldNames.map(function (x) {
	    return "\"".concat(x, "\"");
	  });
	  return "Cannot query field \"".concat(fieldName, "\" on type \"").concat(type, "\".") + (didYouMean('to use an inline fragment on', quotedTypeNames) || didYouMean(quotedFieldNames));
	}
	/**
	 * Fields on correct type
	 *
	 * A GraphQL document is only valid if all fields selected are defined by the
	 * parent type, or are an allowed meta field such as __typename.
	 */

	function FieldsOnCorrectType(context) {
	  return {
	    Field: function Field(node) {
	      var type = context.getParentType();

	      if (type) {
	        var fieldDef = context.getFieldDef();

	        if (!fieldDef) {
	          // This field doesn't exist, lets look for suggestions.
	          var schema = context.getSchema();
	          var fieldName = node.name.value; // First determine if there are any suggested types to condition on.

	          var suggestedTypeNames = getSuggestedTypeNames(schema, type, fieldName); // If there are no suggested types, then perhaps this was a typo?

	          var suggestedFieldNames = suggestedTypeNames.length !== 0 ? [] : getSuggestedFieldNames(schema, type, fieldName); // Report an error, including helpful suggestions.

	          context.reportError(new GraphQLError(undefinedFieldMessage(fieldName, type.name, suggestedTypeNames, suggestedFieldNames), node));
	        }
	      }
	    }
	  };
	}
	/**
	 * Go through all of the implementations of type, as well as the interfaces that
	 * they implement. If any of those types include the provided field, suggest
	 * them, sorted by how often the type is referenced, starting with Interfaces.
	 */

	function getSuggestedTypeNames(schema, type, fieldName) {
	  if (isAbstractType(type)) {
	    var suggestedObjectTypes = [];
	    var interfaceUsageCount = Object.create(null);

	    for (var _i2 = 0, _schema$getPossibleTy2 = schema.getPossibleTypes(type); _i2 < _schema$getPossibleTy2.length; _i2++) {
	      var possibleType = _schema$getPossibleTy2[_i2];

	      if (!possibleType.getFields()[fieldName]) {
	        continue;
	      } // This object type defines this field.


	      suggestedObjectTypes.push(possibleType.name);

	      for (var _i4 = 0, _possibleType$getInte2 = possibleType.getInterfaces(); _i4 < _possibleType$getInte2.length; _i4++) {
	        var possibleInterface = _possibleType$getInte2[_i4];

	        if (!possibleInterface.getFields()[fieldName]) {
	          continue;
	        } // This interface type defines this field.


	        interfaceUsageCount[possibleInterface.name] = (interfaceUsageCount[possibleInterface.name] || 0) + 1;
	      }
	    } // Suggest interface types based on how common they are.


	    var suggestedInterfaceTypes = Object.keys(interfaceUsageCount).sort(function (a, b) {
	      return interfaceUsageCount[b] - interfaceUsageCount[a];
	    }); // Suggest both interface and object types.

	    return suggestedInterfaceTypes.concat(suggestedObjectTypes);
	  } // Otherwise, must be an Object type, which does not have possible fields.


	  return [];
	}
	/**
	 * For the field name provided, determine if there are any similar field names
	 * that may be the result of a typo.
	 */


	function getSuggestedFieldNames(schema, type, fieldName) {
	  if (isObjectType(type) || isInterfaceType(type)) {
	    var possibleFieldNames = Object.keys(type.getFields());
	    return suggestionList(fieldName, possibleFieldNames);
	  } // Otherwise, must be a Union type, which does not define fields.


	  return [];
	}

	function duplicateFragmentNameMessage(fragName) {
	  return "There can be only one fragment named \"".concat(fragName, "\".");
	}
	/**
	 * Unique fragment names
	 *
	 * A GraphQL document is only valid if all defined fragments have unique names.
	 */

	function UniqueFragmentNames(context) {
	  var knownFragmentNames = Object.create(null);
	  return {
	    OperationDefinition: function OperationDefinition() {
	      return false;
	    },
	    FragmentDefinition: function FragmentDefinition(node) {
	      var fragmentName = node.name.value;

	      if (knownFragmentNames[fragmentName]) {
	        context.reportError(new GraphQLError(duplicateFragmentNameMessage(fragmentName), [knownFragmentNames[fragmentName], node.name]));
	      } else {
	        knownFragmentNames[fragmentName] = node.name;
	      }

	      return false;
	    }
	  };
	}

	function unknownFragmentMessage(fragName) {
	  return "Unknown fragment \"".concat(fragName, "\".");
	}
	/**
	 * Known fragment names
	 *
	 * A GraphQL document is only valid if all `...Fragment` fragment spreads refer
	 * to fragments defined in the same document.
	 */

	function KnownFragmentNames(context) {
	  return {
	    FragmentSpread: function FragmentSpread(node) {
	      var fragmentName = node.name.value;
	      var fragment = context.getFragment(fragmentName);

	      if (!fragment) {
	        context.reportError(new GraphQLError(unknownFragmentMessage(fragmentName), node.name));
	      }
	    }
	  };
	}

	function unusedFragMessage(fragName) {
	  return "Fragment \"".concat(fragName, "\" is never used.");
	}
	/**
	 * No unused fragments
	 *
	 * A GraphQL document is only valid if all fragment definitions are spread
	 * within operations, or spread within other fragments spread within operations.
	 */

	function NoUnusedFragments(context) {
	  var operationDefs = [];
	  var fragmentDefs = [];
	  return {
	    OperationDefinition: function OperationDefinition(node) {
	      operationDefs.push(node);
	      return false;
	    },
	    FragmentDefinition: function FragmentDefinition(node) {
	      fragmentDefs.push(node);
	      return false;
	    },
	    Document: {
	      leave: function leave() {
	        var fragmentNameUsed = Object.create(null);

	        for (var _i2 = 0; _i2 < operationDefs.length; _i2++) {
	          var operation = operationDefs[_i2];

	          for (var _i4 = 0, _context$getRecursive2 = context.getRecursivelyReferencedFragments(operation); _i4 < _context$getRecursive2.length; _i4++) {
	            var fragment = _context$getRecursive2[_i4];
	            fragmentNameUsed[fragment.name.value] = true;
	          }
	        }

	        for (var _i6 = 0; _i6 < fragmentDefs.length; _i6++) {
	          var fragmentDef = fragmentDefs[_i6];
	          var fragName = fragmentDef.name.value;

	          if (fragmentNameUsed[fragName] !== true) {
	            context.reportError(new GraphQLError(unusedFragMessage(fragName), fragmentDef));
	          }
	        }
	      }
	    }
	  };
	}

	function typeIncompatibleSpreadMessage(fragName, parentType, fragType) {
	  return "Fragment \"".concat(fragName, "\" cannot be spread here as objects of type \"").concat(parentType, "\" can never be of type \"").concat(fragType, "\".");
	}
	function typeIncompatibleAnonSpreadMessage(parentType, fragType) {
	  return "Fragment cannot be spread here as objects of type \"".concat(parentType, "\" can never be of type \"").concat(fragType, "\".");
	}
	/**
	 * Possible fragment spread
	 *
	 * A fragment spread is only valid if the type condition could ever possibly
	 * be true: if there is a non-empty intersection of the possible parent types,
	 * and possible types which pass the type condition.
	 */

	function PossibleFragmentSpreads(context) {
	  return {
	    InlineFragment: function InlineFragment(node) {
	      var fragType = context.getType();
	      var parentType = context.getParentType();

	      if (isCompositeType(fragType) && isCompositeType(parentType) && !doTypesOverlap(context.getSchema(), fragType, parentType)) {
	        context.reportError(new GraphQLError(typeIncompatibleAnonSpreadMessage(inspect(parentType), inspect(fragType)), node));
	      }
	    },
	    FragmentSpread: function FragmentSpread(node) {
	      var fragName = node.name.value;
	      var fragType = getFragmentType(context, fragName);
	      var parentType = context.getParentType();

	      if (fragType && parentType && !doTypesOverlap(context.getSchema(), fragType, parentType)) {
	        context.reportError(new GraphQLError(typeIncompatibleSpreadMessage(fragName, inspect(parentType), inspect(fragType)), node));
	      }
	    }
	  };
	}

	function getFragmentType(context, name) {
	  var frag = context.getFragment(name);

	  if (frag) {
	    var type = typeFromAST(context.getSchema(), frag.typeCondition);

	    if (isCompositeType(type)) {
	      return type;
	    }
	  }
	}

	function cycleErrorMessage(fragName, spreadNames) {
	  var via = spreadNames.length ? ' via ' + spreadNames.join(', ') : '';
	  return "Cannot spread fragment \"".concat(fragName, "\" within itself").concat(via, ".");
	}
	function NoFragmentCycles(context) {
	  // Tracks already visited fragments to maintain O(N) and to ensure that cycles
	  // are not redundantly reported.
	  var visitedFrags = Object.create(null); // Array of AST nodes used to produce meaningful errors

	  var spreadPath = []; // Position in the spread path

	  var spreadPathIndexByName = Object.create(null);
	  return {
	    OperationDefinition: function OperationDefinition() {
	      return false;
	    },
	    FragmentDefinition: function FragmentDefinition(node) {
	      detectCycleRecursive(node);
	      return false;
	    }
	  }; // This does a straight-forward DFS to find cycles.
	  // It does not terminate when a cycle was found but continues to explore
	  // the graph to find all possible cycles.

	  function detectCycleRecursive(fragment) {
	    if (visitedFrags[fragment.name.value]) {
	      return;
	    }

	    var fragmentName = fragment.name.value;
	    visitedFrags[fragmentName] = true;
	    var spreadNodes = context.getFragmentSpreads(fragment.selectionSet);

	    if (spreadNodes.length === 0) {
	      return;
	    }

	    spreadPathIndexByName[fragmentName] = spreadPath.length;

	    for (var _i2 = 0; _i2 < spreadNodes.length; _i2++) {
	      var spreadNode = spreadNodes[_i2];
	      var spreadName = spreadNode.name.value;
	      var cycleIndex = spreadPathIndexByName[spreadName];
	      spreadPath.push(spreadNode);

	      if (cycleIndex === undefined) {
	        var spreadFragment = context.getFragment(spreadName);

	        if (spreadFragment) {
	          detectCycleRecursive(spreadFragment);
	        }
	      } else {
	        var cyclePath = spreadPath.slice(cycleIndex);
	        var fragmentNames = cyclePath.slice(0, -1).map(function (s) {
	          return s.name.value;
	        });
	        context.reportError(new GraphQLError(cycleErrorMessage(spreadName, fragmentNames), cyclePath));
	      }

	      spreadPath.pop();
	    }

	    spreadPathIndexByName[fragmentName] = undefined;
	  }
	}

	function duplicateVariableMessage(variableName) {
	  return "There can be only one variable named \"".concat(variableName, "\".");
	}
	/**
	 * Unique variable names
	 *
	 * A GraphQL operation is only valid if all its variables are uniquely named.
	 */

	function UniqueVariableNames(context) {
	  var knownVariableNames = Object.create(null);
	  return {
	    OperationDefinition: function OperationDefinition() {
	      knownVariableNames = Object.create(null);
	    },
	    VariableDefinition: function VariableDefinition(node) {
	      var variableName = node.variable.name.value;

	      if (knownVariableNames[variableName]) {
	        context.reportError(new GraphQLError(duplicateVariableMessage(variableName), [knownVariableNames[variableName], node.variable.name]));
	      } else {
	        knownVariableNames[variableName] = node.variable.name;
	      }
	    }
	  };
	}

	function undefinedVarMessage(varName, opName) {
	  return opName ? "Variable \"$".concat(varName, "\" is not defined by operation \"").concat(opName, "\".") : "Variable \"$".concat(varName, "\" is not defined.");
	}
	/**
	 * No undefined variables
	 *
	 * A GraphQL operation is only valid if all variables encountered, both directly
	 * and via fragment spreads, are defined by that operation.
	 */

	function NoUndefinedVariables(context) {
	  var variableNameDefined = Object.create(null);
	  return {
	    OperationDefinition: {
	      enter: function enter() {
	        variableNameDefined = Object.create(null);
	      },
	      leave: function leave(operation) {
	        var usages = context.getRecursiveVariableUsages(operation);

	        for (var _i2 = 0; _i2 < usages.length; _i2++) {
	          var _ref2 = usages[_i2];
	          var node = _ref2.node;
	          var varName = node.name.value;

	          if (variableNameDefined[varName] !== true) {
	            context.reportError(new GraphQLError(undefinedVarMessage(varName, operation.name && operation.name.value), [node, operation]));
	          }
	        }
	      }
	    },
	    VariableDefinition: function VariableDefinition(node) {
	      variableNameDefined[node.variable.name.value] = true;
	    }
	  };
	}

	function unusedVariableMessage(varName, opName) {
	  return opName ? "Variable \"$".concat(varName, "\" is never used in operation \"").concat(opName, "\".") : "Variable \"$".concat(varName, "\" is never used.");
	}
	/**
	 * No unused variables
	 *
	 * A GraphQL operation is only valid if all variables defined by an operation
	 * are used, either directly or within a spread fragment.
	 */

	function NoUnusedVariables(context) {
	  var variableDefs = [];
	  return {
	    OperationDefinition: {
	      enter: function enter() {
	        variableDefs = [];
	      },
	      leave: function leave(operation) {
	        var variableNameUsed = Object.create(null);
	        var usages = context.getRecursiveVariableUsages(operation);
	        var opName = operation.name ? operation.name.value : null;

	        for (var _i2 = 0; _i2 < usages.length; _i2++) {
	          var _ref2 = usages[_i2];
	          var node = _ref2.node;
	          variableNameUsed[node.name.value] = true;
	        }

	        for (var _i4 = 0, _variableDefs2 = variableDefs; _i4 < _variableDefs2.length; _i4++) {
	          var variableDef = _variableDefs2[_i4];
	          var variableName = variableDef.variable.name.value;

	          if (variableNameUsed[variableName] !== true) {
	            context.reportError(new GraphQLError(unusedVariableMessage(variableName, opName), variableDef));
	          }
	        }
	      }
	    },
	    VariableDefinition: function VariableDefinition(def) {
	      variableDefs.push(def);
	    }
	  };
	}

	function unknownDirectiveMessage(directiveName) {
	  return "Unknown directive \"".concat(directiveName, "\".");
	}
	function misplacedDirectiveMessage(directiveName, location) {
	  return "Directive \"".concat(directiveName, "\" may not be used on ").concat(location, ".");
	}
	/**
	 * Known directives
	 *
	 * A GraphQL document is only valid if all `@directives` are known by the
	 * schema and legally positioned.
	 */

	function KnownDirectives(context) {
	  var locationsMap = Object.create(null);
	  var schema = context.getSchema();
	  var definedDirectives = schema ? schema.getDirectives() : specifiedDirectives;

	  for (var _i2 = 0; _i2 < definedDirectives.length; _i2++) {
	    var directive = definedDirectives[_i2];
	    locationsMap[directive.name] = directive.locations;
	  }

	  var astDefinitions = context.getDocument().definitions;

	  for (var _i4 = 0; _i4 < astDefinitions.length; _i4++) {
	    var def = astDefinitions[_i4];

	    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
	      locationsMap[def.name.value] = def.locations.map(function (name) {
	        return name.value;
	      });
	    }
	  }

	  return {
	    Directive: function Directive(node, key, parent, path, ancestors) {
	      var name = node.name.value;
	      var locations = locationsMap[name];

	      if (!locations) {
	        context.reportError(new GraphQLError(unknownDirectiveMessage(name), node));
	        return;
	      }

	      var candidateLocation = getDirectiveLocationForASTPath(ancestors);

	      if (candidateLocation && locations.indexOf(candidateLocation) === -1) {
	        context.reportError(new GraphQLError(misplacedDirectiveMessage(name, candidateLocation), node));
	      }
	    }
	  };
	}

	function getDirectiveLocationForASTPath(ancestors) {
	  var appliedTo = ancestors[ancestors.length - 1];

	  if (!Array.isArray(appliedTo)) {
	    switch (appliedTo.kind) {
	      case Kind.OPERATION_DEFINITION:
	        switch (appliedTo.operation) {
	          case 'query':
	            return DirectiveLocation.QUERY;

	          case 'mutation':
	            return DirectiveLocation.MUTATION;

	          case 'subscription':
	            return DirectiveLocation.SUBSCRIPTION;
	        }

	        break;

	      case Kind.FIELD:
	        return DirectiveLocation.FIELD;

	      case Kind.FRAGMENT_SPREAD:
	        return DirectiveLocation.FRAGMENT_SPREAD;

	      case Kind.INLINE_FRAGMENT:
	        return DirectiveLocation.INLINE_FRAGMENT;

	      case Kind.FRAGMENT_DEFINITION:
	        return DirectiveLocation.FRAGMENT_DEFINITION;

	      case Kind.VARIABLE_DEFINITION:
	        return DirectiveLocation.VARIABLE_DEFINITION;

	      case Kind.SCHEMA_DEFINITION:
	      case Kind.SCHEMA_EXTENSION:
	        return DirectiveLocation.SCHEMA;

	      case Kind.SCALAR_TYPE_DEFINITION:
	      case Kind.SCALAR_TYPE_EXTENSION:
	        return DirectiveLocation.SCALAR;

	      case Kind.OBJECT_TYPE_DEFINITION:
	      case Kind.OBJECT_TYPE_EXTENSION:
	        return DirectiveLocation.OBJECT;

	      case Kind.FIELD_DEFINITION:
	        return DirectiveLocation.FIELD_DEFINITION;

	      case Kind.INTERFACE_TYPE_DEFINITION:
	      case Kind.INTERFACE_TYPE_EXTENSION:
	        return DirectiveLocation.INTERFACE;

	      case Kind.UNION_TYPE_DEFINITION:
	      case Kind.UNION_TYPE_EXTENSION:
	        return DirectiveLocation.UNION;

	      case Kind.ENUM_TYPE_DEFINITION:
	      case Kind.ENUM_TYPE_EXTENSION:
	        return DirectiveLocation.ENUM;

	      case Kind.ENUM_VALUE_DEFINITION:
	        return DirectiveLocation.ENUM_VALUE;

	      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
	      case Kind.INPUT_OBJECT_TYPE_EXTENSION:
	        return DirectiveLocation.INPUT_OBJECT;

	      case Kind.INPUT_VALUE_DEFINITION:
	        {
	          var parentNode = ancestors[ancestors.length - 3];
	          return parentNode.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ? DirectiveLocation.INPUT_FIELD_DEFINITION : DirectiveLocation.ARGUMENT_DEFINITION;
	        }
	    }
	  }
	}

	function duplicateDirectiveMessage(directiveName) {
	  return "The directive \"".concat(directiveName, "\" can only be used once at this location.");
	}
	/**
	 * Unique directive names per location
	 *
	 * A GraphQL document is only valid if all non-repeatable directives at
	 * a given location are uniquely named.
	 */

	function UniqueDirectivesPerLocation(context) {
	  var uniqueDirectiveMap = Object.create(null);
	  var schema = context.getSchema();
	  var definedDirectives = schema ? schema.getDirectives() : specifiedDirectives;

	  for (var _i2 = 0; _i2 < definedDirectives.length; _i2++) {
	    var directive = definedDirectives[_i2];
	    uniqueDirectiveMap[directive.name] = !directive.isRepeatable;
	  }

	  var astDefinitions = context.getDocument().definitions;

	  for (var _i4 = 0; _i4 < astDefinitions.length; _i4++) {
	    var def = astDefinitions[_i4];

	    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
	      uniqueDirectiveMap[def.name.value] = !def.repeatable;
	    }
	  }

	  return {
	    // Many different AST nodes may contain directives. Rather than listing
	    // them all, just listen for entering any node, and check to see if it
	    // defines any directives.
	    enter: function enter(node) {
	      // Flow can't refine that node.directives will only contain directives,
	      // so we cast so the rest of the code is well typed.
	      var directives = node.directives;

	      if (directives) {
	        var knownDirectives = Object.create(null);

	        for (var _i6 = 0; _i6 < directives.length; _i6++) {
	          var _directive = directives[_i6];
	          var directiveName = _directive.name.value;

	          if (uniqueDirectiveMap[directiveName]) {
	            if (knownDirectives[directiveName]) {
	              context.reportError(new GraphQLError(duplicateDirectiveMessage(directiveName), [knownDirectives[directiveName], _directive]));
	            } else {
	              knownDirectives[directiveName] = _directive;
	            }
	          }
	        }
	      }
	    }
	  };
	}

	function ownKeys$2(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

	function _objectSpread$1(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys$2(source, true).forEach(function (key) { _defineProperty$1(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys$2(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

	function _defineProperty$1(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
	function unknownArgMessage(argName, fieldName, typeName, suggestedArgs) {
	  return "Unknown argument \"".concat(argName, "\" on field \"").concat(fieldName, "\" of type \"").concat(typeName, "\".") + didYouMean(suggestedArgs.map(function (x) {
	    return "\"".concat(x, "\"");
	  }));
	}
	function unknownDirectiveArgMessage(argName, directiveName, suggestedArgs) {
	  return "Unknown argument \"".concat(argName, "\" on directive \"@").concat(directiveName, "\".") + didYouMean(suggestedArgs.map(function (x) {
	    return "\"".concat(x, "\"");
	  }));
	}
	/**
	 * Known argument names
	 *
	 * A GraphQL field is only valid if all supplied arguments are defined by
	 * that field.
	 */

	function KnownArgumentNames(context) {
	  return _objectSpread$1({}, KnownArgumentNamesOnDirectives(context), {
	    Argument: function Argument(argNode) {
	      var argDef = context.getArgument();
	      var fieldDef = context.getFieldDef();
	      var parentType = context.getParentType();

	      if (!argDef && fieldDef && parentType) {
	        var argName = argNode.name.value;
	        var knownArgsNames = fieldDef.args.map(function (arg) {
	          return arg.name;
	        });
	        context.reportError(new GraphQLError(unknownArgMessage(argName, fieldDef.name, parentType.name, suggestionList(argName, knownArgsNames)), argNode));
	      }
	    }
	  });
	} // @internal

	function KnownArgumentNamesOnDirectives(context) {
	  var directiveArgs = Object.create(null);
	  var schema = context.getSchema();
	  var definedDirectives = schema ? schema.getDirectives() : specifiedDirectives;

	  for (var _i2 = 0; _i2 < definedDirectives.length; _i2++) {
	    var directive = definedDirectives[_i2];
	    directiveArgs[directive.name] = directive.args.map(function (arg) {
	      return arg.name;
	    });
	  }

	  var astDefinitions = context.getDocument().definitions;

	  for (var _i4 = 0; _i4 < astDefinitions.length; _i4++) {
	    var def = astDefinitions[_i4];

	    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
	      directiveArgs[def.name.value] = def.arguments ? def.arguments.map(function (arg) {
	        return arg.name.value;
	      }) : [];
	    }
	  }

	  return {
	    Directive: function Directive(directiveNode) {
	      var directiveName = directiveNode.name.value;
	      var knownArgs = directiveArgs[directiveName];

	      if (directiveNode.arguments && knownArgs) {
	        for (var _i6 = 0, _directiveNode$argume2 = directiveNode.arguments; _i6 < _directiveNode$argume2.length; _i6++) {
	          var argNode = _directiveNode$argume2[_i6];
	          var argName = argNode.name.value;

	          if (knownArgs.indexOf(argName) === -1) {
	            var suggestions = suggestionList(argName, knownArgs);
	            context.reportError(new GraphQLError(unknownDirectiveArgMessage(argName, directiveName, suggestions), argNode));
	          }
	        }
	      }

	      return false;
	    }
	  };
	}

	function duplicateArgMessage(argName) {
	  return "There can be only one argument named \"".concat(argName, "\".");
	}
	/**
	 * Unique argument names
	 *
	 * A GraphQL field or directive is only valid if all supplied arguments are
	 * uniquely named.
	 */

	function UniqueArgumentNames(context) {
	  var knownArgNames = Object.create(null);
	  return {
	    Field: function Field() {
	      knownArgNames = Object.create(null);
	    },
	    Directive: function Directive() {
	      knownArgNames = Object.create(null);
	    },
	    Argument: function Argument(node) {
	      var argName = node.name.value;

	      if (knownArgNames[argName]) {
	        context.reportError(new GraphQLError(duplicateArgMessage(argName), [knownArgNames[argName], node.name]));
	      } else {
	        knownArgNames[argName] = node.name;
	      }

	      return false;
	    }
	  };
	}

	function badValueMessage(typeName, valueName, message) {
	  return "Expected type ".concat(typeName, ", found ").concat(valueName) + (message ? "; ".concat(message) : '.');
	}
	function badEnumValueMessage(typeName, valueName, suggestedValues) {
	  return "Expected type ".concat(typeName, ", found ").concat(valueName, ".") + didYouMean('the enum value', suggestedValues);
	}
	function requiredFieldMessage(typeName, fieldName, fieldTypeName) {
	  return "Field ".concat(typeName, ".").concat(fieldName, " of required type ").concat(fieldTypeName, " was not provided.");
	}
	function unknownFieldMessage(typeName, fieldName, suggestedFields) {
	  return "Field \"".concat(fieldName, "\" is not defined by type ").concat(typeName, ".") + didYouMean(suggestedFields);
	}
	/**
	 * Value literals of correct type
	 *
	 * A GraphQL document is only valid if all value literals are of the type
	 * expected at their position.
	 */

	function ValuesOfCorrectType(context) {
	  return {
	    NullValue: function NullValue(node) {
	      var type = context.getInputType();

	      if (isNonNullType(type)) {
	        context.reportError(new GraphQLError(badValueMessage(inspect(type), print(node)), node));
	      }
	    },
	    ListValue: function ListValue(node) {
	      // Note: TypeInfo will traverse into a list's item type, so look to the
	      // parent input type to check if it is a list.
	      var type = getNullableType(context.getParentInputType());

	      if (!isListType(type)) {
	        isValidScalar(context, node);
	        return false; // Don't traverse further.
	      }
	    },
	    ObjectValue: function ObjectValue(node) {
	      var type = getNamedType(context.getInputType());

	      if (!isInputObjectType(type)) {
	        isValidScalar(context, node);
	        return false; // Don't traverse further.
	      } // Ensure every required field exists.


	      var fieldNodeMap = keyMap(node.fields, function (field) {
	        return field.name.value;
	      });

	      for (var _i2 = 0, _objectValues2 = objectValues(type.getFields()); _i2 < _objectValues2.length; _i2++) {
	        var fieldDef = _objectValues2[_i2];
	        var fieldNode = fieldNodeMap[fieldDef.name];

	        if (!fieldNode && isRequiredInputField(fieldDef)) {
	          var typeStr = inspect(fieldDef.type);
	          context.reportError(new GraphQLError(requiredFieldMessage(type.name, fieldDef.name, typeStr), node));
	        }
	      }
	    },
	    ObjectField: function ObjectField(node) {
	      var parentType = getNamedType(context.getParentInputType());
	      var fieldType = context.getInputType();

	      if (!fieldType && isInputObjectType(parentType)) {
	        var suggestions = suggestionList(node.name.value, Object.keys(parentType.getFields()));
	        context.reportError(new GraphQLError(unknownFieldMessage(parentType.name, node.name.value, suggestions), node));
	      }
	    },
	    EnumValue: function EnumValue(node) {
	      var type = getNamedType(context.getInputType());

	      if (!isEnumType(type)) {
	        isValidScalar(context, node);
	      } else if (!type.getValue(node.value)) {
	        context.reportError(new GraphQLError(badEnumValueMessage(type.name, print(node), enumTypeSuggestion(type, node)), node));
	      }
	    },
	    IntValue: function IntValue(node) {
	      return isValidScalar(context, node);
	    },
	    FloatValue: function FloatValue(node) {
	      return isValidScalar(context, node);
	    },
	    StringValue: function StringValue(node) {
	      return isValidScalar(context, node);
	    },
	    BooleanValue: function BooleanValue(node) {
	      return isValidScalar(context, node);
	    }
	  };
	}
	/**
	 * Any value literal may be a valid representation of a Scalar, depending on
	 * that scalar type.
	 */

	function isValidScalar(context, node) {
	  // Report any error at the full type expected by the location.
	  var locationType = context.getInputType();

	  if (!locationType) {
	    return;
	  }

	  var type = getNamedType(locationType);

	  if (!isScalarType(type)) {
	    var message = isEnumType(type) ? badEnumValueMessage(inspect(locationType), print(node), enumTypeSuggestion(type, node)) : badValueMessage(inspect(locationType), print(node));
	    context.reportError(new GraphQLError(message, node));
	    return;
	  } // Scalars determine if a literal value is valid via parseLiteral() which
	  // may throw or return an invalid value to indicate failure.


	  try {
	    var parseResult = type.parseLiteral(node, undefined
	    /* variables */
	    );

	    if (isInvalid(parseResult)) {
	      context.reportError(new GraphQLError(badValueMessage(inspect(locationType), print(node)), node));
	    }
	  } catch (error) {
	    // Ensure a reference to the original error is maintained.
	    context.reportError(new GraphQLError(badValueMessage(inspect(locationType), print(node), error.message), node, undefined, undefined, undefined, error));
	  }
	}

	function enumTypeSuggestion(type, node) {
	  var allNames = type.getValues().map(function (value) {
	    return value.name;
	  });
	  return suggestionList(print(node), allNames);
	}

	function ownKeys$3(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

	function _objectSpread$2(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys$3(source, true).forEach(function (key) { _defineProperty$2(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys$3(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

	function _defineProperty$2(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
	function missingFieldArgMessage(fieldName, argName, type) {
	  return "Field \"".concat(fieldName, "\" argument \"").concat(argName, "\" of type \"").concat(type, "\" is required, but it was not provided.");
	}
	function missingDirectiveArgMessage(directiveName, argName, type) {
	  return "Directive \"@".concat(directiveName, "\" argument \"").concat(argName, "\" of type \"").concat(type, "\" is required, but it was not provided.");
	}
	/**
	 * Provided required arguments
	 *
	 * A field or directive is only valid if all required (non-null without a
	 * default value) field arguments have been provided.
	 */

	function ProvidedRequiredArguments(context) {
	  return _objectSpread$2({}, ProvidedRequiredArgumentsOnDirectives(context), {
	    Field: {
	      // Validate on leave to allow for deeper errors to appear first.
	      leave: function leave(fieldNode) {
	        var fieldDef = context.getFieldDef();

	        if (!fieldDef) {
	          return false;
	        }

	        var argNodes = fieldNode.arguments || [];
	        var argNodeMap = keyMap(argNodes, function (arg) {
	          return arg.name.value;
	        });

	        for (var _i2 = 0, _fieldDef$args2 = fieldDef.args; _i2 < _fieldDef$args2.length; _i2++) {
	          var argDef = _fieldDef$args2[_i2];
	          var argNode = argNodeMap[argDef.name];

	          if (!argNode && isRequiredArgument(argDef)) {
	            context.reportError(new GraphQLError(missingFieldArgMessage(fieldDef.name, argDef.name, inspect(argDef.type)), fieldNode));
	          }
	        }
	      }
	    }
	  });
	} // @internal

	function ProvidedRequiredArgumentsOnDirectives(context) {
	  var requiredArgsMap = Object.create(null);
	  var schema = context.getSchema();
	  var definedDirectives = schema ? schema.getDirectives() : specifiedDirectives;

	  for (var _i4 = 0; _i4 < definedDirectives.length; _i4++) {
	    var directive = definedDirectives[_i4];
	    requiredArgsMap[directive.name] = keyMap(directive.args.filter(isRequiredArgument), function (arg) {
	      return arg.name;
	    });
	  }

	  var astDefinitions = context.getDocument().definitions;

	  for (var _i6 = 0; _i6 < astDefinitions.length; _i6++) {
	    var def = astDefinitions[_i6];

	    if (def.kind === Kind.DIRECTIVE_DEFINITION) {
	      requiredArgsMap[def.name.value] = keyMap(def.arguments ? def.arguments.filter(isRequiredArgumentNode) : [], function (arg) {
	        return arg.name.value;
	      });
	    }
	  }

	  return {
	    Directive: {
	      // Validate on leave to allow for deeper errors to appear first.
	      leave: function leave(directiveNode) {
	        var directiveName = directiveNode.name.value;
	        var requiredArgs = requiredArgsMap[directiveName];

	        if (requiredArgs) {
	          var argNodes = directiveNode.arguments || [];
	          var argNodeMap = keyMap(argNodes, function (arg) {
	            return arg.name.value;
	          });

	          for (var _i8 = 0, _Object$keys2 = Object.keys(requiredArgs); _i8 < _Object$keys2.length; _i8++) {
	            var argName = _Object$keys2[_i8];

	            if (!argNodeMap[argName]) {
	              var argType = requiredArgs[argName].type;
	              context.reportError(new GraphQLError(missingDirectiveArgMessage(directiveName, argName, isType(argType) ? inspect(argType) : print(argType)), directiveNode));
	            }
	          }
	        }
	      }
	    }
	  };
	}

	function isRequiredArgumentNode(arg) {
	  return arg.type.kind === Kind.NON_NULL_TYPE && arg.defaultValue == null;
	}

	function badVarPosMessage(varName, varType, expectedType) {
	  return "Variable \"$".concat(varName, "\" of type \"").concat(varType, "\" used in position expecting type \"").concat(expectedType, "\".");
	}
	/**
	 * Variables passed to field arguments conform to type
	 */

	function VariablesInAllowedPosition(context) {
	  var varDefMap = Object.create(null);
	  return {
	    OperationDefinition: {
	      enter: function enter() {
	        varDefMap = Object.create(null);
	      },
	      leave: function leave(operation) {
	        var usages = context.getRecursiveVariableUsages(operation);

	        for (var _i2 = 0; _i2 < usages.length; _i2++) {
	          var _ref2 = usages[_i2];
	          var node = _ref2.node;
	          var type = _ref2.type;
	          var defaultValue = _ref2.defaultValue;
	          var varName = node.name.value;
	          var varDef = varDefMap[varName];

	          if (varDef && type) {
	            // A var type is allowed if it is the same or more strict (e.g. is
	            // a subtype of) than the expected type. It can be more strict if
	            // the variable type is non-null when the expected type is nullable.
	            // If both are list types, the variable item type can be more strict
	            // than the expected item type (contravariant).
	            var schema = context.getSchema();
	            var varType = typeFromAST(schema, varDef.type);

	            if (varType && !allowedVariableUsage(schema, varType, varDef.defaultValue, type, defaultValue)) {
	              context.reportError(new GraphQLError(badVarPosMessage(varName, inspect(varType), inspect(type)), [varDef, node]));
	            }
	          }
	        }
	      }
	    },
	    VariableDefinition: function VariableDefinition(node) {
	      varDefMap[node.variable.name.value] = node;
	    }
	  };
	}
	/**
	 * Returns true if the variable is allowed in the location it was found,
	 * which includes considering if default values exist for either the variable
	 * or the location at which it is located.
	 */

	function allowedVariableUsage(schema, varType, varDefaultValue, locationType, locationDefaultValue) {
	  if (isNonNullType(locationType) && !isNonNullType(varType)) {
	    var hasNonNullVariableDefaultValue = varDefaultValue != null && varDefaultValue.kind !== Kind.NULL;
	    var hasLocationDefaultValue = locationDefaultValue !== undefined;

	    if (!hasNonNullVariableDefaultValue && !hasLocationDefaultValue) {
	      return false;
	    }

	    var nullableLocationType = locationType.ofType;
	    return isTypeSubTypeOf(schema, varType, nullableLocationType);
	  }

	  return isTypeSubTypeOf(schema, varType, locationType);
	}

	function fieldsConflictMessage(responseName, reason) {
	  return "Fields \"".concat(responseName, "\" conflict because ").concat(reasonMessage(reason), ". ") + 'Use different aliases on the fields to fetch both if this was intentional.';
	}

	function reasonMessage(reason) {
	  if (Array.isArray(reason)) {
	    return reason.map(function (_ref) {
	      var responseName = _ref[0],
	          subreason = _ref[1];
	      return "subfields \"".concat(responseName, "\" conflict because ").concat(reasonMessage(subreason));
	    }).join(' and ');
	  }

	  return reason;
	}
	/**
	 * Overlapping fields can be merged
	 *
	 * A selection set is only valid if all fields (including spreading any
	 * fragments) either correspond to distinct response names or can be merged
	 * without ambiguity.
	 */


	function OverlappingFieldsCanBeMerged(context) {
	  // A memoization for when two fragments are compared "between" each other for
	  // conflicts. Two fragments may be compared many times, so memoizing this can
	  // dramatically improve the performance of this validator.
	  var comparedFragmentPairs = new PairSet(); // A cache for the "field map" and list of fragment names found in any given
	  // selection set. Selection sets may be asked for this information multiple
	  // times, so this improves the performance of this validator.

	  var cachedFieldsAndFragmentNames = new Map();
	  return {
	    SelectionSet: function SelectionSet(selectionSet) {
	      var conflicts = findConflictsWithinSelectionSet(context, cachedFieldsAndFragmentNames, comparedFragmentPairs, context.getParentType(), selectionSet);

	      for (var _i2 = 0; _i2 < conflicts.length; _i2++) {
	        var _ref3 = conflicts[_i2];
	        var _ref2$ = _ref3[0];
	        var responseName = _ref2$[0];
	        var reason = _ref2$[1];
	        var fields1 = _ref3[1];
	        var fields2 = _ref3[2];
	        context.reportError(new GraphQLError(fieldsConflictMessage(responseName, reason), fields1.concat(fields2)));
	      }
	    }
	  };
	}

	/**
	 * Algorithm:
	 *
	 * Conflicts occur when two fields exist in a query which will produce the same
	 * response name, but represent differing values, thus creating a conflict.
	 * The algorithm below finds all conflicts via making a series of comparisons
	 * between fields. In order to compare as few fields as possible, this makes
	 * a series of comparisons "within" sets of fields and "between" sets of fields.
	 *
	 * Given any selection set, a collection produces both a set of fields by
	 * also including all inline fragments, as well as a list of fragments
	 * referenced by fragment spreads.
	 *
	 * A) Each selection set represented in the document first compares "within" its
	 * collected set of fields, finding any conflicts between every pair of
	 * overlapping fields.
	 * Note: This is the *only time* that a the fields "within" a set are compared
	 * to each other. After this only fields "between" sets are compared.
	 *
	 * B) Also, if any fragment is referenced in a selection set, then a
	 * comparison is made "between" the original set of fields and the
	 * referenced fragment.
	 *
	 * C) Also, if multiple fragments are referenced, then comparisons
	 * are made "between" each referenced fragment.
	 *
	 * D) When comparing "between" a set of fields and a referenced fragment, first
	 * a comparison is made between each field in the original set of fields and
	 * each field in the the referenced set of fields.
	 *
	 * E) Also, if any fragment is referenced in the referenced selection set,
	 * then a comparison is made "between" the original set of fields and the
	 * referenced fragment (recursively referring to step D).
	 *
	 * F) When comparing "between" two fragments, first a comparison is made between
	 * each field in the first referenced set of fields and each field in the the
	 * second referenced set of fields.
	 *
	 * G) Also, any fragments referenced by the first must be compared to the
	 * second, and any fragments referenced by the second must be compared to the
	 * first (recursively referring to step F).
	 *
	 * H) When comparing two fields, if both have selection sets, then a comparison
	 * is made "between" both selection sets, first comparing the set of fields in
	 * the first selection set with the set of fields in the second.
	 *
	 * I) Also, if any fragment is referenced in either selection set, then a
	 * comparison is made "between" the other set of fields and the
	 * referenced fragment.
	 *
	 * J) Also, if two fragments are referenced in both selection sets, then a
	 * comparison is made "between" the two fragments.
	 *
	 */
	// Find all conflicts found "within" a selection set, including those found
	// via spreading in fragments. Called when visiting each SelectionSet in the
	// GraphQL Document.
	function findConflictsWithinSelectionSet(context, cachedFieldsAndFragmentNames, comparedFragmentPairs, parentType, selectionSet) {
	  var conflicts = [];

	  var _getFieldsAndFragment = getFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, parentType, selectionSet),
	      fieldMap = _getFieldsAndFragment[0],
	      fragmentNames = _getFieldsAndFragment[1]; // (A) Find find all conflicts "within" the fields of this selection set.
	  // Note: this is the *only place* `collectConflictsWithin` is called.


	  collectConflictsWithin(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, fieldMap);

	  if (fragmentNames.length !== 0) {
	    // (B) Then collect conflicts between these fields and those represented by
	    // each spread fragment name found.
	    var comparedFragments = Object.create(null);

	    for (var i = 0; i < fragmentNames.length; i++) {
	      collectConflictsBetweenFieldsAndFragment(context, conflicts, cachedFieldsAndFragmentNames, comparedFragments, comparedFragmentPairs, false, fieldMap, fragmentNames[i]); // (C) Then compare this fragment with all other fragments found in this
	      // selection set to collect conflicts between fragments spread together.
	      // This compares each item in the list of fragment names to every other
	      // item in that same list (except for itself).

	      for (var j = i + 1; j < fragmentNames.length; j++) {
	        collectConflictsBetweenFragments(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, false, fragmentNames[i], fragmentNames[j]);
	      }
	    }
	  }

	  return conflicts;
	} // Collect all conflicts found between a set of fields and a fragment reference
	// including via spreading in any nested fragments.


	function collectConflictsBetweenFieldsAndFragment(context, conflicts, cachedFieldsAndFragmentNames, comparedFragments, comparedFragmentPairs, areMutuallyExclusive, fieldMap, fragmentName) {
	  // Memoize so a fragment is not compared for conflicts more than once.
	  if (comparedFragments[fragmentName]) {
	    return;
	  }

	  comparedFragments[fragmentName] = true;
	  var fragment = context.getFragment(fragmentName);

	  if (!fragment) {
	    return;
	  }

	  var _getReferencedFieldsA = getReferencedFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, fragment),
	      fieldMap2 = _getReferencedFieldsA[0],
	      fragmentNames2 = _getReferencedFieldsA[1]; // Do not compare a fragment's fieldMap to itself.


	  if (fieldMap === fieldMap2) {
	    return;
	  } // (D) First collect any conflicts between the provided collection of fields
	  // and the collection of fields represented by the given fragment.


	  collectConflictsBetween(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, fieldMap, fieldMap2); // (E) Then collect any conflicts between the provided collection of fields
	  // and any fragment names found in the given fragment.

	  for (var i = 0; i < fragmentNames2.length; i++) {
	    collectConflictsBetweenFieldsAndFragment(context, conflicts, cachedFieldsAndFragmentNames, comparedFragments, comparedFragmentPairs, areMutuallyExclusive, fieldMap, fragmentNames2[i]);
	  }
	} // Collect all conflicts found between two fragments, including via spreading in
	// any nested fragments.


	function collectConflictsBetweenFragments(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, fragmentName1, fragmentName2) {
	  // No need to compare a fragment to itself.
	  if (fragmentName1 === fragmentName2) {
	    return;
	  } // Memoize so two fragments are not compared for conflicts more than once.


	  if (comparedFragmentPairs.has(fragmentName1, fragmentName2, areMutuallyExclusive)) {
	    return;
	  }

	  comparedFragmentPairs.add(fragmentName1, fragmentName2, areMutuallyExclusive);
	  var fragment1 = context.getFragment(fragmentName1);
	  var fragment2 = context.getFragment(fragmentName2);

	  if (!fragment1 || !fragment2) {
	    return;
	  }

	  var _getReferencedFieldsA2 = getReferencedFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, fragment1),
	      fieldMap1 = _getReferencedFieldsA2[0],
	      fragmentNames1 = _getReferencedFieldsA2[1];

	  var _getReferencedFieldsA3 = getReferencedFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, fragment2),
	      fieldMap2 = _getReferencedFieldsA3[0],
	      fragmentNames2 = _getReferencedFieldsA3[1]; // (F) First, collect all conflicts between these two collections of fields
	  // (not including any nested fragments).


	  collectConflictsBetween(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, fieldMap1, fieldMap2); // (G) Then collect conflicts between the first fragment and any nested
	  // fragments spread in the second fragment.

	  for (var j = 0; j < fragmentNames2.length; j++) {
	    collectConflictsBetweenFragments(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, fragmentName1, fragmentNames2[j]);
	  } // (G) Then collect conflicts between the second fragment and any nested
	  // fragments spread in the first fragment.


	  for (var i = 0; i < fragmentNames1.length; i++) {
	    collectConflictsBetweenFragments(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, fragmentNames1[i], fragmentName2);
	  }
	} // Find all conflicts found between two selection sets, including those found
	// via spreading in fragments. Called when determining if conflicts exist
	// between the sub-fields of two overlapping fields.


	function findConflictsBetweenSubSelectionSets(context, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, parentType1, selectionSet1, parentType2, selectionSet2) {
	  var conflicts = [];

	  var _getFieldsAndFragment2 = getFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, parentType1, selectionSet1),
	      fieldMap1 = _getFieldsAndFragment2[0],
	      fragmentNames1 = _getFieldsAndFragment2[1];

	  var _getFieldsAndFragment3 = getFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, parentType2, selectionSet2),
	      fieldMap2 = _getFieldsAndFragment3[0],
	      fragmentNames2 = _getFieldsAndFragment3[1]; // (H) First, collect all conflicts between these two collections of field.


	  collectConflictsBetween(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, fieldMap1, fieldMap2); // (I) Then collect conflicts between the first collection of fields and
	  // those referenced by each fragment name associated with the second.

	  if (fragmentNames2.length !== 0) {
	    var comparedFragments = Object.create(null);

	    for (var j = 0; j < fragmentNames2.length; j++) {
	      collectConflictsBetweenFieldsAndFragment(context, conflicts, cachedFieldsAndFragmentNames, comparedFragments, comparedFragmentPairs, areMutuallyExclusive, fieldMap1, fragmentNames2[j]);
	    }
	  } // (I) Then collect conflicts between the second collection of fields and
	  // those referenced by each fragment name associated with the first.


	  if (fragmentNames1.length !== 0) {
	    var _comparedFragments = Object.create(null);

	    for (var i = 0; i < fragmentNames1.length; i++) {
	      collectConflictsBetweenFieldsAndFragment(context, conflicts, cachedFieldsAndFragmentNames, _comparedFragments, comparedFragmentPairs, areMutuallyExclusive, fieldMap2, fragmentNames1[i]);
	    }
	  } // (J) Also collect conflicts between any fragment names by the first and
	  // fragment names by the second. This compares each item in the first set of
	  // names to each item in the second set of names.


	  for (var _i3 = 0; _i3 < fragmentNames1.length; _i3++) {
	    for (var _j = 0; _j < fragmentNames2.length; _j++) {
	      collectConflictsBetweenFragments(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, fragmentNames1[_i3], fragmentNames2[_j]);
	    }
	  }

	  return conflicts;
	} // Collect all Conflicts "within" one collection of fields.


	function collectConflictsWithin(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, fieldMap) {
	  // A field map is a keyed collection, where each key represents a response
	  // name and the value at that key is a list of all fields which provide that
	  // response name. For every response name, if there are multiple fields, they
	  // must be compared to find a potential conflict.
	  for (var _i5 = 0, _objectEntries2 = objectEntries(fieldMap); _i5 < _objectEntries2.length; _i5++) {
	    var _ref5 = _objectEntries2[_i5];
	    var responseName = _ref5[0];
	    var fields = _ref5[1];

	    // This compares every field in the list to every other field in this list
	    // (except to itself). If the list only has one item, nothing needs to
	    // be compared.
	    if (fields.length > 1) {
	      for (var i = 0; i < fields.length; i++) {
	        for (var j = i + 1; j < fields.length; j++) {
	          var conflict = findConflict(context, cachedFieldsAndFragmentNames, comparedFragmentPairs, false, // within one collection is never mutually exclusive
	          responseName, fields[i], fields[j]);

	          if (conflict) {
	            conflicts.push(conflict);
	          }
	        }
	      }
	    }
	  }
	} // Collect all Conflicts between two collections of fields. This is similar to,
	// but different from the `collectConflictsWithin` function above. This check
	// assumes that `collectConflictsWithin` has already been called on each
	// provided collection of fields. This is true because this validator traverses
	// each individual selection set.


	function collectConflictsBetween(context, conflicts, cachedFieldsAndFragmentNames, comparedFragmentPairs, parentFieldsAreMutuallyExclusive, fieldMap1, fieldMap2) {
	  // A field map is a keyed collection, where each key represents a response
	  // name and the value at that key is a list of all fields which provide that
	  // response name. For any response name which appears in both provided field
	  // maps, each field from the first field map must be compared to every field
	  // in the second field map to find potential conflicts.
	  for (var _i7 = 0, _Object$keys2 = Object.keys(fieldMap1); _i7 < _Object$keys2.length; _i7++) {
	    var responseName = _Object$keys2[_i7];
	    var fields2 = fieldMap2[responseName];

	    if (fields2) {
	      var fields1 = fieldMap1[responseName];

	      for (var i = 0; i < fields1.length; i++) {
	        for (var j = 0; j < fields2.length; j++) {
	          var conflict = findConflict(context, cachedFieldsAndFragmentNames, comparedFragmentPairs, parentFieldsAreMutuallyExclusive, responseName, fields1[i], fields2[j]);

	          if (conflict) {
	            conflicts.push(conflict);
	          }
	        }
	      }
	    }
	  }
	} // Determines if there is a conflict between two particular fields, including
	// comparing their sub-fields.


	function findConflict(context, cachedFieldsAndFragmentNames, comparedFragmentPairs, parentFieldsAreMutuallyExclusive, responseName, field1, field2) {
	  var parentType1 = field1[0],
	      node1 = field1[1],
	      def1 = field1[2];
	  var parentType2 = field2[0],
	      node2 = field2[1],
	      def2 = field2[2]; // If it is known that two fields could not possibly apply at the same
	  // time, due to the parent types, then it is safe to permit them to diverge
	  // in aliased field or arguments used as they will not present any ambiguity
	  // by differing.
	  // It is known that two parent types could never overlap if they are
	  // different Object types. Interface or Union types might overlap - if not
	  // in the current state of the schema, then perhaps in some future version,
	  // thus may not safely diverge.

	  var areMutuallyExclusive = parentFieldsAreMutuallyExclusive || parentType1 !== parentType2 && isObjectType(parentType1) && isObjectType(parentType2); // The return type for each field.

	  var type1 = def1 && def1.type;
	  var type2 = def2 && def2.type;

	  if (!areMutuallyExclusive) {
	    // Two aliases must refer to the same field.
	    var name1 = node1.name.value;
	    var name2 = node2.name.value;

	    if (name1 !== name2) {
	      return [[responseName, "".concat(name1, " and ").concat(name2, " are different fields")], [node1], [node2]];
	    } // Two field calls must have the same arguments.


	    if (!sameArguments(node1.arguments || [], node2.arguments || [])) {
	      return [[responseName, 'they have differing arguments'], [node1], [node2]];
	    }
	  }

	  if (type1 && type2 && doTypesConflict(type1, type2)) {
	    return [[responseName, "they return conflicting types ".concat(inspect(type1), " and ").concat(inspect(type2))], [node1], [node2]];
	  } // Collect and compare sub-fields. Use the same "visited fragment names" list
	  // for both collections so fields in a fragment reference are never
	  // compared to themselves.


	  var selectionSet1 = node1.selectionSet;
	  var selectionSet2 = node2.selectionSet;

	  if (selectionSet1 && selectionSet2) {
	    var conflicts = findConflictsBetweenSubSelectionSets(context, cachedFieldsAndFragmentNames, comparedFragmentPairs, areMutuallyExclusive, getNamedType(type1), selectionSet1, getNamedType(type2), selectionSet2);
	    return subfieldConflicts(conflicts, responseName, node1, node2);
	  }
	}

	function sameArguments(arguments1, arguments2) {
	  if (arguments1.length !== arguments2.length) {
	    return false;
	  }

	  return arguments1.every(function (argument1) {
	    var argument2 = find(arguments2, function (argument) {
	      return argument.name.value === argument1.name.value;
	    });

	    if (!argument2) {
	      return false;
	    }

	    return sameValue(argument1.value, argument2.value);
	  });
	}

	function sameValue(value1, value2) {
	  return !value1 && !value2 || print(value1) === print(value2);
	} // Two types conflict if both types could not apply to a value simultaneously.
	// Composite types are ignored as their individual field types will be compared
	// later recursively. However List and Non-Null types must match.


	function doTypesConflict(type1, type2) {
	  if (isListType(type1)) {
	    return isListType(type2) ? doTypesConflict(type1.ofType, type2.ofType) : true;
	  }

	  if (isListType(type2)) {
	    return true;
	  }

	  if (isNonNullType(type1)) {
	    return isNonNullType(type2) ? doTypesConflict(type1.ofType, type2.ofType) : true;
	  }

	  if (isNonNullType(type2)) {
	    return true;
	  }

	  if (isLeafType(type1) || isLeafType(type2)) {
	    return type1 !== type2;
	  }

	  return false;
	} // Given a selection set, return the collection of fields (a mapping of response
	// name to field nodes and definitions) as well as a list of fragment names
	// referenced via fragment spreads.


	function getFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, parentType, selectionSet) {
	  var cached = cachedFieldsAndFragmentNames.get(selectionSet);

	  if (!cached) {
	    var nodeAndDefs = Object.create(null);
	    var fragmentNames = Object.create(null);

	    _collectFieldsAndFragmentNames(context, parentType, selectionSet, nodeAndDefs, fragmentNames);

	    cached = [nodeAndDefs, Object.keys(fragmentNames)];
	    cachedFieldsAndFragmentNames.set(selectionSet, cached);
	  }

	  return cached;
	} // Given a reference to a fragment, return the represented collection of fields
	// as well as a list of nested fragment names referenced via fragment spreads.


	function getReferencedFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, fragment) {
	  // Short-circuit building a type from the node if possible.
	  var cached = cachedFieldsAndFragmentNames.get(fragment.selectionSet);

	  if (cached) {
	    return cached;
	  }

	  var fragmentType = typeFromAST(context.getSchema(), fragment.typeCondition);
	  return getFieldsAndFragmentNames(context, cachedFieldsAndFragmentNames, fragmentType, fragment.selectionSet);
	}

	function _collectFieldsAndFragmentNames(context, parentType, selectionSet, nodeAndDefs, fragmentNames) {
	  for (var _i9 = 0, _selectionSet$selecti2 = selectionSet.selections; _i9 < _selectionSet$selecti2.length; _i9++) {
	    var selection = _selectionSet$selecti2[_i9];

	    switch (selection.kind) {
	      case Kind.FIELD:
	        {
	          var fieldName = selection.name.value;
	          var fieldDef = void 0;

	          if (isObjectType(parentType) || isInterfaceType(parentType)) {
	            fieldDef = parentType.getFields()[fieldName];
	          }

	          var responseName = selection.alias ? selection.alias.value : fieldName;

	          if (!nodeAndDefs[responseName]) {
	            nodeAndDefs[responseName] = [];
	          }

	          nodeAndDefs[responseName].push([parentType, selection, fieldDef]);
	          break;
	        }

	      case Kind.FRAGMENT_SPREAD:
	        fragmentNames[selection.name.value] = true;
	        break;

	      case Kind.INLINE_FRAGMENT:
	        {
	          var typeCondition = selection.typeCondition;
	          var inlineFragmentType = typeCondition ? typeFromAST(context.getSchema(), typeCondition) : parentType;

	          _collectFieldsAndFragmentNames(context, inlineFragmentType, selection.selectionSet, nodeAndDefs, fragmentNames);

	          break;
	        }
	    }
	  }
	} // Given a series of Conflicts which occurred between two sub-fields, generate
	// a single Conflict.


	function subfieldConflicts(conflicts, responseName, node1, node2) {
	  if (conflicts.length > 0) {
	    return [[responseName, conflicts.map(function (_ref6) {
	      var reason = _ref6[0];
	      return reason;
	    })], conflicts.reduce(function (allFields, _ref7) {
	      var fields1 = _ref7[1];
	      return allFields.concat(fields1);
	    }, [node1]), conflicts.reduce(function (allFields, _ref8) {
	      var fields2 = _ref8[2];
	      return allFields.concat(fields2);
	    }, [node2])];
	  }
	}
	/**
	 * A way to keep track of pairs of things when the ordering of the pair does
	 * not matter. We do this by maintaining a sort of double adjacency sets.
	 */


	var PairSet =
	/*#__PURE__*/
	function () {
	  function PairSet() {
	    this._data = Object.create(null);
	  }

	  var _proto = PairSet.prototype;

	  _proto.has = function has(a, b, areMutuallyExclusive) {
	    var first = this._data[a];
	    var result = first && first[b];

	    if (result === undefined) {
	      return false;
	    } // areMutuallyExclusive being false is a superset of being true,
	    // hence if we want to know if this PairSet "has" these two with no
	    // exclusivity, we have to ensure it was added as such.


	    if (areMutuallyExclusive === false) {
	      return result === false;
	    }

	    return true;
	  };

	  _proto.add = function add(a, b, areMutuallyExclusive) {
	    _pairSetAdd(this._data, a, b, areMutuallyExclusive);

	    _pairSetAdd(this._data, b, a, areMutuallyExclusive);
	  };

	  return PairSet;
	}();

	function _pairSetAdd(data, a, b, areMutuallyExclusive) {
	  var map = data[a];

	  if (!map) {
	    map = Object.create(null);
	    data[a] = map;
	  }

	  map[b] = areMutuallyExclusive;
	}

	function duplicateInputFieldMessage(fieldName) {
	  return "There can be only one input field named \"".concat(fieldName, "\".");
	}
	/**
	 * Unique input field names
	 *
	 * A GraphQL input object value is only valid if all supplied fields are
	 * uniquely named.
	 */

	function UniqueInputFieldNames(context) {
	  var knownNameStack = [];
	  var knownNames = Object.create(null);
	  return {
	    ObjectValue: {
	      enter: function enter() {
	        knownNameStack.push(knownNames);
	        knownNames = Object.create(null);
	      },
	      leave: function leave() {
	        knownNames = knownNameStack.pop();
	      }
	    },
	    ObjectField: function ObjectField(node) {
	      var fieldName = node.name.value;

	      if (knownNames[fieldName]) {
	        context.reportError(new GraphQLError(duplicateInputFieldMessage(fieldName), [knownNames[fieldName], node.name]));
	      } else {
	        knownNames[fieldName] = node.name;
	      }
	    }
	  };
	}

	function schemaDefinitionNotAloneMessage() {
	  return 'Must provide only one schema definition.';
	}
	function canNotDefineSchemaWithinExtensionMessage() {
	  return 'Cannot define a new schema within a schema extension.';
	}
	/**
	 * Lone Schema definition
	 *
	 * A GraphQL document is only valid if it contains only one schema definition.
	 */

	function LoneSchemaDefinition(context) {
	  var oldSchema = context.getSchema();
	  var alreadyDefined = oldSchema && (oldSchema.astNode || oldSchema.getQueryType() || oldSchema.getMutationType() || oldSchema.getSubscriptionType());
	  var schemaDefinitionsCount = 0;
	  return {
	    SchemaDefinition: function SchemaDefinition(node) {
	      if (alreadyDefined) {
	        context.reportError(new GraphQLError(canNotDefineSchemaWithinExtensionMessage(), node));
	        return;
	      }

	      if (schemaDefinitionsCount > 0) {
	        context.reportError(new GraphQLError(schemaDefinitionNotAloneMessage(), node));
	      }

	      ++schemaDefinitionsCount;
	    }
	  };
	}

	function duplicateOperationTypeMessage(operation) {
	  return "There can be only one ".concat(operation, " type in schema.");
	}
	function existedOperationTypeMessage(operation) {
	  return "Type for ".concat(operation, " already defined in the schema. It cannot be redefined.");
	}
	/**
	 * Unique operation types
	 *
	 * A GraphQL document is only valid if it has only one type per operation.
	 */

	function UniqueOperationTypes(context) {
	  var schema = context.getSchema();
	  var definedOperationTypes = Object.create(null);
	  var existingOperationTypes = schema ? {
	    query: schema.getQueryType(),
	    mutation: schema.getMutationType(),
	    subscription: schema.getSubscriptionType()
	  } : {};
	  return {
	    SchemaDefinition: checkOperationTypes,
	    SchemaExtension: checkOperationTypes
	  };

	  function checkOperationTypes(node) {
	    if (node.operationTypes) {
	      for (var _i2 = 0, _ref2 = node.operationTypes || []; _i2 < _ref2.length; _i2++) {
	        var operationType = _ref2[_i2];
	        var operation = operationType.operation;
	        var alreadyDefinedOperationType = definedOperationTypes[operation];

	        if (existingOperationTypes[operation]) {
	          context.reportError(new GraphQLError(existedOperationTypeMessage(operation), operationType));
	        } else if (alreadyDefinedOperationType) {
	          context.reportError(new GraphQLError(duplicateOperationTypeMessage(operation), [alreadyDefinedOperationType, operationType]));
	        } else {
	          definedOperationTypes[operation] = operationType;
	        }
	      }
	    }

	    return false;
	  }
	}

	function duplicateTypeNameMessage(typeName) {
	  return "There can be only one type named \"".concat(typeName, "\".");
	}
	function existedTypeNameMessage(typeName) {
	  return "Type \"".concat(typeName, "\" already exists in the schema. It cannot also be defined in this type definition.");
	}
	/**
	 * Unique type names
	 *
	 * A GraphQL document is only valid if all defined types have unique names.
	 */

	function UniqueTypeNames(context) {
	  var knownTypeNames = Object.create(null);
	  var schema = context.getSchema();
	  return {
	    ScalarTypeDefinition: checkTypeName,
	    ObjectTypeDefinition: checkTypeName,
	    InterfaceTypeDefinition: checkTypeName,
	    UnionTypeDefinition: checkTypeName,
	    EnumTypeDefinition: checkTypeName,
	    InputObjectTypeDefinition: checkTypeName
	  };

	  function checkTypeName(node) {
	    var typeName = node.name.value;

	    if (schema && schema.getType(typeName)) {
	      context.reportError(new GraphQLError(existedTypeNameMessage(typeName), node.name));
	      return;
	    }

	    if (knownTypeNames[typeName]) {
	      context.reportError(new GraphQLError(duplicateTypeNameMessage(typeName), [knownTypeNames[typeName], node.name]));
	    } else {
	      knownTypeNames[typeName] = node.name;
	    }

	    return false;
	  }
	}

	var UniqueTypeNames$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		duplicateTypeNameMessage: duplicateTypeNameMessage,
		existedTypeNameMessage: existedTypeNameMessage,
		UniqueTypeNames: UniqueTypeNames
	});

	function duplicateEnumValueNameMessage(typeName, valueName) {
	  return "Enum value \"".concat(typeName, ".").concat(valueName, "\" can only be defined once.");
	}
	function existedEnumValueNameMessage(typeName, valueName) {
	  return "Enum value \"".concat(typeName, ".").concat(valueName, "\" already exists in the schema. It cannot also be defined in this type extension.");
	}
	/**
	 * Unique enum value names
	 *
	 * A GraphQL enum type is only valid if all its values are uniquely named.
	 */

	function UniqueEnumValueNames(context) {
	  var schema = context.getSchema();
	  var existingTypeMap = schema ? schema.getTypeMap() : Object.create(null);
	  var knownValueNames = Object.create(null);
	  return {
	    EnumTypeDefinition: checkValueUniqueness,
	    EnumTypeExtension: checkValueUniqueness
	  };

	  function checkValueUniqueness(node) {
	    var typeName = node.name.value;

	    if (!knownValueNames[typeName]) {
	      knownValueNames[typeName] = Object.create(null);
	    }

	    if (node.values) {
	      var valueNames = knownValueNames[typeName];

	      for (var _i2 = 0, _node$values2 = node.values; _i2 < _node$values2.length; _i2++) {
	        var valueDef = _node$values2[_i2];
	        var valueName = valueDef.name.value;
	        var existingType = existingTypeMap[typeName];

	        if (isEnumType(existingType) && existingType.getValue(valueName)) {
	          context.reportError(new GraphQLError(existedEnumValueNameMessage(typeName, valueName), valueDef.name));
	        } else if (valueNames[valueName]) {
	          context.reportError(new GraphQLError(duplicateEnumValueNameMessage(typeName, valueName), [valueNames[valueName], valueDef.name]));
	        } else {
	          valueNames[valueName] = valueDef.name;
	        }
	      }
	    }

	    return false;
	  }
	}

	var UniqueEnumValueNames$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		duplicateEnumValueNameMessage: duplicateEnumValueNameMessage,
		existedEnumValueNameMessage: existedEnumValueNameMessage,
		UniqueEnumValueNames: UniqueEnumValueNames
	});

	function duplicateFieldDefinitionNameMessage(typeName, fieldName) {
	  return "Field \"".concat(typeName, ".").concat(fieldName, "\" can only be defined once.");
	}
	function existedFieldDefinitionNameMessage(typeName, fieldName) {
	  return "Field \"".concat(typeName, ".").concat(fieldName, "\" already exists in the schema. It cannot also be defined in this type extension.");
	}
	/**
	 * Unique field definition names
	 *
	 * A GraphQL complex type is only valid if all its fields are uniquely named.
	 */

	function UniqueFieldDefinitionNames(context) {
	  var schema = context.getSchema();
	  var existingTypeMap = schema ? schema.getTypeMap() : Object.create(null);
	  var knownFieldNames = Object.create(null);
	  return {
	    InputObjectTypeDefinition: checkFieldUniqueness,
	    InputObjectTypeExtension: checkFieldUniqueness,
	    InterfaceTypeDefinition: checkFieldUniqueness,
	    InterfaceTypeExtension: checkFieldUniqueness,
	    ObjectTypeDefinition: checkFieldUniqueness,
	    ObjectTypeExtension: checkFieldUniqueness
	  };

	  function checkFieldUniqueness(node) {
	    var typeName = node.name.value;

	    if (!knownFieldNames[typeName]) {
	      knownFieldNames[typeName] = Object.create(null);
	    }

	    if (node.fields) {
	      var fieldNames = knownFieldNames[typeName];

	      for (var _i2 = 0, _node$fields2 = node.fields; _i2 < _node$fields2.length; _i2++) {
	        var fieldDef = _node$fields2[_i2];
	        var fieldName = fieldDef.name.value;

	        if (hasField(existingTypeMap[typeName], fieldName)) {
	          context.reportError(new GraphQLError(existedFieldDefinitionNameMessage(typeName, fieldName), fieldDef.name));
	        } else if (fieldNames[fieldName]) {
	          context.reportError(new GraphQLError(duplicateFieldDefinitionNameMessage(typeName, fieldName), [fieldNames[fieldName], fieldDef.name]));
	        } else {
	          fieldNames[fieldName] = fieldDef.name;
	        }
	      }
	    }

	    return false;
	  }
	}

	function hasField(type, fieldName) {
	  if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
	    return type.getFields()[fieldName];
	  }

	  return false;
	}

	var UniqueFieldDefinitionNames$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		duplicateFieldDefinitionNameMessage: duplicateFieldDefinitionNameMessage,
		existedFieldDefinitionNameMessage: existedFieldDefinitionNameMessage,
		UniqueFieldDefinitionNames: UniqueFieldDefinitionNames
	});

	function duplicateDirectiveNameMessage(directiveName) {
	  return "There can be only one directive named \"".concat(directiveName, "\".");
	}
	function existedDirectiveNameMessage(directiveName) {
	  return "Directive \"".concat(directiveName, "\" already exists in the schema. It cannot be redefined.");
	}
	/**
	 * Unique directive names
	 *
	 * A GraphQL document is only valid if all defined directives have unique names.
	 */

	function UniqueDirectiveNames(context) {
	  var knownDirectiveNames = Object.create(null);
	  var schema = context.getSchema();
	  return {
	    DirectiveDefinition: function DirectiveDefinition(node) {
	      var directiveName = node.name.value;

	      if (schema && schema.getDirective(directiveName)) {
	        context.reportError(new GraphQLError(existedDirectiveNameMessage(directiveName), node.name));
	        return;
	      }

	      if (knownDirectiveNames[directiveName]) {
	        context.reportError(new GraphQLError(duplicateDirectiveNameMessage(directiveName), [knownDirectiveNames[directiveName], node.name]));
	      } else {
	        knownDirectiveNames[directiveName] = node.name;
	      }

	      return false;
	    }
	  };
	}

	var _defKindToExtKind;

	function _defineProperty$3(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
	function extendingUnknownTypeMessage(typeName, suggestedTypes) {
	  return "Cannot extend type \"".concat(typeName, "\" because it is not defined.") + didYouMean(suggestedTypes.map(function (x) {
	    return "\"".concat(x, "\"");
	  }));
	}
	function extendingDifferentTypeKindMessage(typeName, kind) {
	  return "Cannot extend non-".concat(kind, " type \"").concat(typeName, "\".");
	}
	/**
	 * Possible type extension
	 *
	 * A type extension is only valid if the type is defined and has the same kind.
	 */

	function PossibleTypeExtensions(context) {
	  var schema = context.getSchema();
	  var definedTypes = Object.create(null);

	  for (var _i2 = 0, _context$getDocument$2 = context.getDocument().definitions; _i2 < _context$getDocument$2.length; _i2++) {
	    var def = _context$getDocument$2[_i2];

	    if (isTypeDefinitionNode(def)) {
	      definedTypes[def.name.value] = def;
	    }
	  }

	  return {
	    ScalarTypeExtension: checkExtension,
	    ObjectTypeExtension: checkExtension,
	    InterfaceTypeExtension: checkExtension,
	    UnionTypeExtension: checkExtension,
	    EnumTypeExtension: checkExtension,
	    InputObjectTypeExtension: checkExtension
	  };

	  function checkExtension(node) {
	    var typeName = node.name.value;
	    var defNode = definedTypes[typeName];
	    var existingType = schema && schema.getType(typeName);

	    if (defNode) {
	      var expectedKind = defKindToExtKind[defNode.kind];

	      if (expectedKind !== node.kind) {
	        context.reportError(new GraphQLError(extendingDifferentTypeKindMessage(typeName, extensionKindToTypeName(expectedKind)), [defNode, node]));
	      }
	    } else if (existingType) {
	      var _expectedKind = typeToExtKind(existingType);

	      if (_expectedKind !== node.kind) {
	        context.reportError(new GraphQLError(extendingDifferentTypeKindMessage(typeName, extensionKindToTypeName(_expectedKind)), node));
	      }
	    } else {
	      var allTypeNames = Object.keys(definedTypes);

	      if (schema) {
	        allTypeNames = allTypeNames.concat(Object.keys(schema.getTypeMap()));
	      }

	      var suggestedTypes = suggestionList(typeName, allTypeNames);
	      context.reportError(new GraphQLError(extendingUnknownTypeMessage(typeName, suggestedTypes), node.name));
	    }
	  }
	}
	var defKindToExtKind = (_defKindToExtKind = {}, _defineProperty$3(_defKindToExtKind, Kind.SCALAR_TYPE_DEFINITION, Kind.SCALAR_TYPE_EXTENSION), _defineProperty$3(_defKindToExtKind, Kind.OBJECT_TYPE_DEFINITION, Kind.OBJECT_TYPE_EXTENSION), _defineProperty$3(_defKindToExtKind, Kind.INTERFACE_TYPE_DEFINITION, Kind.INTERFACE_TYPE_EXTENSION), _defineProperty$3(_defKindToExtKind, Kind.UNION_TYPE_DEFINITION, Kind.UNION_TYPE_EXTENSION), _defineProperty$3(_defKindToExtKind, Kind.ENUM_TYPE_DEFINITION, Kind.ENUM_TYPE_EXTENSION), _defineProperty$3(_defKindToExtKind, Kind.INPUT_OBJECT_TYPE_DEFINITION, Kind.INPUT_OBJECT_TYPE_EXTENSION), _defKindToExtKind);

	function typeToExtKind(type) {
	  if (isScalarType(type)) {
	    return Kind.SCALAR_TYPE_EXTENSION;
	  } else if (isObjectType(type)) {
	    return Kind.OBJECT_TYPE_EXTENSION;
	  } else if (isInterfaceType(type)) {
	    return Kind.INTERFACE_TYPE_EXTENSION;
	  } else if (isUnionType(type)) {
	    return Kind.UNION_TYPE_EXTENSION;
	  } else if (isEnumType(type)) {
	    return Kind.ENUM_TYPE_EXTENSION;
	  } else if (isInputObjectType(type)) {
	    return Kind.INPUT_OBJECT_TYPE_EXTENSION;
	  }
	}

	function extensionKindToTypeName(kind) {
	  switch (kind) {
	    case Kind.SCALAR_TYPE_EXTENSION:
	      return 'scalar';

	    case Kind.OBJECT_TYPE_EXTENSION:
	      return 'object';

	    case Kind.INTERFACE_TYPE_EXTENSION:
	      return 'interface';

	    case Kind.UNION_TYPE_EXTENSION:
	      return 'union';

	    case Kind.ENUM_TYPE_EXTENSION:
	      return 'enum';

	    case Kind.INPUT_OBJECT_TYPE_EXTENSION:
	      return 'input object';

	    default:
	      return 'unknown type';
	  }
	}

	var PossibleTypeExtensions$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		extendingUnknownTypeMessage: extendingUnknownTypeMessage,
		extendingDifferentTypeKindMessage: extendingDifferentTypeKindMessage,
		PossibleTypeExtensions: PossibleTypeExtensions
	});

	// Spec Section: "Executable Definitions"
	/**
	 * This set includes all validation rules defined by the GraphQL spec.
	 *
	 * The order of the rules in this list has been adjusted to lead to the
	 * most clear output when encountering multiple validation errors.
	 */

	var specifiedRules = Object.freeze([ExecutableDefinitions, UniqueOperationNames, LoneAnonymousOperation, SingleFieldSubscriptions, KnownTypeNames, FragmentsOnCompositeTypes, VariablesAreInputTypes, ScalarLeafs, FieldsOnCorrectType, UniqueFragmentNames, KnownFragmentNames, NoUnusedFragments, PossibleFragmentSpreads, NoFragmentCycles, UniqueVariableNames, NoUndefinedVariables, NoUnusedVariables, KnownDirectives, UniqueDirectivesPerLocation, KnownArgumentNames, UniqueArgumentNames, ValuesOfCorrectType, ProvidedRequiredArguments, VariablesInAllowedPosition, OverlappingFieldsCanBeMerged, UniqueInputFieldNames]);

	var specifiedSDLRules = Object.freeze([LoneSchemaDefinition, UniqueOperationTypes, UniqueTypeNames, UniqueEnumValueNames, UniqueFieldDefinitionNames, UniqueDirectiveNames, KnownTypeNames, KnownDirectives, UniqueDirectivesPerLocation, PossibleTypeExtensions, KnownArgumentNamesOnDirectives, UniqueArgumentNames, UniqueInputFieldNames, ProvidedRequiredArgumentsOnDirectives]);

	var specifiedRules$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		specifiedRules: specifiedRules,
		specifiedSDLRules: specifiedSDLRules
	});

	function _inheritsLoose(subClass, superClass) { subClass.prototype = Object.create(superClass.prototype); subClass.prototype.constructor = subClass; subClass.__proto__ = superClass; }

	/**
	 * An instance of this class is passed as the "this" context to all validators,
	 * allowing access to commonly useful contextual information from within a
	 * validation rule.
	 */
	var ASTValidationContext =
	/*#__PURE__*/
	function () {
	  function ASTValidationContext(ast, onError) {
	    this._ast = ast;
	    this._errors = [];
	    this._fragments = undefined;
	    this._fragmentSpreads = new Map();
	    this._recursivelyReferencedFragments = new Map();
	    this._onError = onError;
	  }

	  var _proto = ASTValidationContext.prototype;

	  _proto.reportError = function reportError(error) {
	    this._errors.push(error);

	    if (this._onError) {
	      this._onError(error);
	    }
	  } // @deprecated: use onError callback instead - will be removed in v15.
	  ;

	  _proto.getErrors = function getErrors() {
	    return this._errors;
	  };

	  _proto.getDocument = function getDocument() {
	    return this._ast;
	  };

	  _proto.getFragment = function getFragment(name) {
	    var fragments = this._fragments;

	    if (!fragments) {
	      this._fragments = fragments = this.getDocument().definitions.reduce(function (frags, statement) {
	        if (statement.kind === Kind.FRAGMENT_DEFINITION) {
	          frags[statement.name.value] = statement;
	        }

	        return frags;
	      }, Object.create(null));
	    }

	    return fragments[name];
	  };

	  _proto.getFragmentSpreads = function getFragmentSpreads(node) {
	    var spreads = this._fragmentSpreads.get(node);

	    if (!spreads) {
	      spreads = [];
	      var setsToVisit = [node];

	      while (setsToVisit.length !== 0) {
	        var set = setsToVisit.pop();

	        for (var _i2 = 0, _set$selections2 = set.selections; _i2 < _set$selections2.length; _i2++) {
	          var selection = _set$selections2[_i2];

	          if (selection.kind === Kind.FRAGMENT_SPREAD) {
	            spreads.push(selection);
	          } else if (selection.selectionSet) {
	            setsToVisit.push(selection.selectionSet);
	          }
	        }
	      }

	      this._fragmentSpreads.set(node, spreads);
	    }

	    return spreads;
	  };

	  _proto.getRecursivelyReferencedFragments = function getRecursivelyReferencedFragments(operation) {
	    var fragments = this._recursivelyReferencedFragments.get(operation);

	    if (!fragments) {
	      fragments = [];
	      var collectedNames = Object.create(null);
	      var nodesToVisit = [operation.selectionSet];

	      while (nodesToVisit.length !== 0) {
	        var node = nodesToVisit.pop();

	        for (var _i4 = 0, _this$getFragmentSpre2 = this.getFragmentSpreads(node); _i4 < _this$getFragmentSpre2.length; _i4++) {
	          var spread = _this$getFragmentSpre2[_i4];
	          var fragName = spread.name.value;

	          if (collectedNames[fragName] !== true) {
	            collectedNames[fragName] = true;
	            var fragment = this.getFragment(fragName);

	            if (fragment) {
	              fragments.push(fragment);
	              nodesToVisit.push(fragment.selectionSet);
	            }
	          }
	        }
	      }

	      this._recursivelyReferencedFragments.set(operation, fragments);
	    }

	    return fragments;
	  };

	  return ASTValidationContext;
	}();
	var SDLValidationContext =
	/*#__PURE__*/
	function (_ASTValidationContext) {
	  _inheritsLoose(SDLValidationContext, _ASTValidationContext);

	  function SDLValidationContext(ast, schema, onError) {
	    var _this;

	    _this = _ASTValidationContext.call(this, ast, onError) || this;
	    _this._schema = schema;
	    return _this;
	  }

	  var _proto2 = SDLValidationContext.prototype;

	  _proto2.getSchema = function getSchema() {
	    return this._schema;
	  };

	  return SDLValidationContext;
	}(ASTValidationContext);
	var ValidationContext =
	/*#__PURE__*/
	function (_ASTValidationContext2) {
	  _inheritsLoose(ValidationContext, _ASTValidationContext2);

	  function ValidationContext(schema, ast, typeInfo, onError) {
	    var _this2;

	    _this2 = _ASTValidationContext2.call(this, ast, onError) || this;
	    _this2._schema = schema;
	    _this2._typeInfo = typeInfo;
	    _this2._variableUsages = new Map();
	    _this2._recursiveVariableUsages = new Map();
	    return _this2;
	  }

	  var _proto3 = ValidationContext.prototype;

	  _proto3.getSchema = function getSchema() {
	    return this._schema;
	  };

	  _proto3.getVariableUsages = function getVariableUsages(node) {
	    var usages = this._variableUsages.get(node);

	    if (!usages) {
	      var newUsages = [];
	      var typeInfo = new TypeInfo(this._schema);
	      visit(node, visitWithTypeInfo(typeInfo, {
	        VariableDefinition: function VariableDefinition() {
	          return false;
	        },
	        Variable: function Variable(variable) {
	          newUsages.push({
	            node: variable,
	            type: typeInfo.getInputType(),
	            defaultValue: typeInfo.getDefaultValue()
	          });
	        }
	      }));
	      usages = newUsages;

	      this._variableUsages.set(node, usages);
	    }

	    return usages;
	  };

	  _proto3.getRecursiveVariableUsages = function getRecursiveVariableUsages(operation) {
	    var usages = this._recursiveVariableUsages.get(operation);

	    if (!usages) {
	      usages = this.getVariableUsages(operation);

	      for (var _i6 = 0, _this$getRecursivelyR2 = this.getRecursivelyReferencedFragments(operation); _i6 < _this$getRecursivelyR2.length; _i6++) {
	        var frag = _this$getRecursivelyR2[_i6];
	        usages = usages.concat(this.getVariableUsages(frag));
	      }

	      this._recursiveVariableUsages.set(operation, usages);
	    }

	    return usages;
	  };

	  _proto3.getType = function getType() {
	    return this._typeInfo.getType();
	  };

	  _proto3.getParentType = function getParentType() {
	    return this._typeInfo.getParentType();
	  };

	  _proto3.getInputType = function getInputType() {
	    return this._typeInfo.getInputType();
	  };

	  _proto3.getParentInputType = function getParentInputType() {
	    return this._typeInfo.getParentInputType();
	  };

	  _proto3.getFieldDef = function getFieldDef() {
	    return this._typeInfo.getFieldDef();
	  };

	  _proto3.getDirective = function getDirective() {
	    return this._typeInfo.getDirective();
	  };

	  _proto3.getArgument = function getArgument() {
	    return this._typeInfo.getArgument();
	  };

	  return ValidationContext;
	}(ASTValidationContext);

	var ABORT_VALIDATION = Object.freeze({});
	/**
	 * Implements the "Validation" section of the spec.
	 *
	 * Validation runs synchronously, returning an array of encountered errors, or
	 * an empty array if no errors were encountered and the document is valid.
	 *
	 * A list of specific validation rules may be provided. If not provided, the
	 * default list of rules defined by the GraphQL specification will be used.
	 *
	 * Each validation rules is a function which returns a visitor
	 * (see the language/visitor API). Visitor methods are expected to return
	 * GraphQLErrors, or Arrays of GraphQLErrors when invalid.
	 *
	 * Optionally a custom TypeInfo instance may be provided. If not provided, one
	 * will be created from the provided schema.
	 */

	function validate(schema, documentAST) {
	  var rules = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : specifiedRules;
	  var typeInfo = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : new TypeInfo(schema);
	  var options = arguments.length > 4 ? arguments[4] : undefined;
	  documentAST || devAssert(0, 'Must provide document'); // If the schema used for validation is invalid, throw an error.

	  assertValidSchema(schema);
	  var abortObj = Object.freeze({});
	  var errors = [];
	  var maxErrors = options && options.maxErrors;
	  var context = new ValidationContext(schema, documentAST, typeInfo, function (error) {
	    if (maxErrors != null && errors.length >= maxErrors) {
	      errors.push(new GraphQLError('Too many validation errors, error limit reached. Validation aborted.'));
	      throw abortObj;
	    }

	    errors.push(error);
	  }); // This uses a specialized visitor which runs multiple visitors in parallel,
	  // while maintaining the visitor skip and break API.

	  var visitor = visitInParallel(rules.map(function (rule) {
	    return rule(context);
	  })); // Visit the whole document with each instance of all provided rules.

	  try {
	    visit(documentAST, visitWithTypeInfo(typeInfo, visitor));
	  } catch (e) {
	    if (e !== abortObj) {
	      throw e;
	    }
	  }

	  return errors;
	} // @internal

	function validateSDL(documentAST, schemaToExtend) {
	  var rules = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : specifiedSDLRules;
	  var errors = [];
	  var context = new SDLValidationContext(documentAST, schemaToExtend, function (error) {
	    errors.push(error);
	  });
	  var visitors = rules.map(function (rule) {
	    return rule(context);
	  });
	  visit(documentAST, visitInParallel(visitors));
	  return errors;
	}
	/**
	 * Utility function which asserts a SDL document is valid by throwing an error
	 * if it is invalid.
	 *
	 * @internal
	 */

	function assertValidSDL(documentAST) {
	  var errors = validateSDL(documentAST);

	  if (errors.length !== 0) {
	    throw new Error(errors.map(function (error) {
	      return error.message;
	    }).join('\n\n'));
	  }
	}
	/**
	 * Utility function which asserts a SDL document is valid by throwing an error
	 * if it is invalid.
	 *
	 * @internal
	 */

	function assertValidSDLExtension(documentAST, schema) {
	  var errors = validateSDL(documentAST, schema);

	  if (errors.length !== 0) {
	    throw new Error(errors.map(function (error) {
	      return error.message;
	    }).join('\n\n'));
	  }
	}

	var validate$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		ABORT_VALIDATION: ABORT_VALIDATION,
		validate: validate,
		validateSDL: validateSDL,
		assertValidSDL: assertValidSDL,
		assertValidSDLExtension: assertValidSDLExtension
	});

	/**
	 * Memoizes the provided three-argument function.
	 */
	function memoize3(fn) {
	  var cache0;

	  function memoized(a1, a2, a3) {
	    if (!cache0) {
	      cache0 = new WeakMap();
	    }

	    var cache1 = cache0.get(a1);
	    var cache2;

	    if (cache1) {
	      cache2 = cache1.get(a2);

	      if (cache2) {
	        var cachedValue = cache2.get(a3);

	        if (cachedValue !== undefined) {
	          return cachedValue;
	        }
	      }
	    } else {
	      cache1 = new WeakMap();
	      cache0.set(a1, cache1);
	    }

	    if (!cache2) {
	      cache2 = new WeakMap();
	      cache1.set(a2, cache2);
	    }

	    var newValue = fn(a1, a2, a3);
	    cache2.set(a3, newValue);
	    return newValue;
	  }

	  return memoized;
	}

	/**
	 * Similar to Array.prototype.reduce(), however the reducing callback may return
	 * a Promise, in which case reduction will continue after each promise resolves.
	 *
	 * If the callback does not return a Promise, then this function will also not
	 * return a Promise.
	 */
	function promiseReduce(values, callback, initialValue) {
	  return values.reduce(function (previous, value) {
	    return isPromise(previous) ? previous.then(function (resolved) {
	      return callback(resolved, value);
	    }) : callback(previous, value);
	  }, initialValue);
	}

	/**
	 * This function transforms a JS object `ObjMap<Promise<T>>` into
	 * a `Promise<ObjMap<T>>`
	 *
	 * This is akin to bluebird's `Promise.props`, but implemented only using
	 * `Promise.all` so it will work with any implementation of ES6 promises.
	 */
	function promiseForObject(object) {
	  var keys = Object.keys(object);
	  var valuesAndPromises = keys.map(function (name) {
	    return object[name];
	  });
	  return Promise.all(valuesAndPromises).then(function (values) {
	    return values.reduce(function (resolvedObject, value, i) {
	      resolvedObject[keys[i]] = value;
	      return resolvedObject;
	    }, Object.create(null));
	  });
	}

	/**
	 * Given a Path and a key, return a new Path containing the new key.
	 */
	function addPath(prev, key) {
	  return {
	    prev: prev,
	    key: key
	  };
	}
	/**
	 * Given a Path, return an Array of the path keys.
	 */

	function pathToArray(path) {
	  var flattened = [];
	  var curr = path;

	  while (curr) {
	    flattened.push(curr.key);
	    curr = curr.prev;
	  }

	  return flattened.reverse();
	}

	/**
	 * Given an arbitrary Error, presumably thrown while attempting to execute a
	 * GraphQL operation, produce a new GraphQLError aware of the location in the
	 * document responsible for the original Error.
	 */

	function locatedError(originalError, nodes, path) {
	  // Note: this uses a brand-check to support GraphQL errors originating from
	  // other contexts.
	  if (originalError && Array.isArray(originalError.path)) {
	    return originalError;
	  }

	  return new GraphQLError(originalError && originalError.message, originalError && originalError.nodes || nodes, originalError && originalError.source, originalError && originalError.positions, path, originalError);
	}

	/**
	 * Extracts the root type of the operation from the schema.
	 */
	function getOperationRootType(schema, operation) {
	  if (operation.operation === 'query') {
	    var queryType = schema.getQueryType();

	    if (!queryType) {
	      throw new GraphQLError('Schema does not define the required query root type.', operation);
	    }

	    return queryType;
	  }

	  if (operation.operation === 'mutation') {
	    var mutationType = schema.getMutationType();

	    if (!mutationType) {
	      throw new GraphQLError('Schema is not configured for mutations.', operation);
	    }

	    return mutationType;
	  }

	  if (operation.operation === 'subscription') {
	    var subscriptionType = schema.getSubscriptionType();

	    if (!subscriptionType) {
	      throw new GraphQLError('Schema is not configured for subscriptions.', operation);
	    }

	    return subscriptionType;
	  }

	  throw new GraphQLError('Can only have query, mutation and subscription operations.', operation);
	}

	/**
	 * Build a string describing the path.
	 */
	function printPathArray(path) {
	  return path.map(function (key) {
	    return typeof key === 'number' ? '[' + key.toString() + ']' : '.' + key;
	  }).join('');
	}

	/**
	 * Produces a JavaScript value given a GraphQL Value AST.
	 *
	 * A GraphQL type must be provided, which will be used to interpret different
	 * GraphQL Value literals.
	 *
	 * Returns `undefined` when the value could not be validly coerced according to
	 * the provided type.
	 *
	 * | GraphQL Value        | JSON Value    |
	 * | -------------------- | ------------- |
	 * | Input Object         | Object        |
	 * | List                 | Array         |
	 * | Boolean              | Boolean       |
	 * | String               | String        |
	 * | Int / Float          | Number        |
	 * | Enum Value           | Mixed         |
	 * | NullValue            | null          |
	 *
	 */

	function valueFromAST(valueNode, type, variables) {
	  if (!valueNode) {
	    // When there is no node, then there is also no value.
	    // Importantly, this is different from returning the value null.
	    return;
	  }

	  if (isNonNullType(type)) {
	    if (valueNode.kind === Kind.NULL) {
	      return; // Invalid: intentionally return no value.
	    }

	    return valueFromAST(valueNode, type.ofType, variables);
	  }

	  if (valueNode.kind === Kind.NULL) {
	    // This is explicitly returning the value null.
	    return null;
	  }

	  if (valueNode.kind === Kind.VARIABLE) {
	    var variableName = valueNode.name.value;

	    if (!variables || isInvalid(variables[variableName])) {
	      // No valid return value.
	      return;
	    }

	    var variableValue = variables[variableName];

	    if (variableValue === null && isNonNullType(type)) {
	      return; // Invalid: intentionally return no value.
	    } // Note: This does no further checking that this variable is correct.
	    // This assumes that this query has been validated and the variable
	    // usage here is of the correct type.


	    return variableValue;
	  }

	  if (isListType(type)) {
	    var itemType = type.ofType;

	    if (valueNode.kind === Kind.LIST) {
	      var coercedValues = [];

	      for (var _i2 = 0, _valueNode$values2 = valueNode.values; _i2 < _valueNode$values2.length; _i2++) {
	        var itemNode = _valueNode$values2[_i2];

	        if (isMissingVariable(itemNode, variables)) {
	          // If an array contains a missing variable, it is either coerced to
	          // null or if the item type is non-null, it considered invalid.
	          if (isNonNullType(itemType)) {
	            return; // Invalid: intentionally return no value.
	          }

	          coercedValues.push(null);
	        } else {
	          var itemValue = valueFromAST(itemNode, itemType, variables);

	          if (isInvalid(itemValue)) {
	            return; // Invalid: intentionally return no value.
	          }

	          coercedValues.push(itemValue);
	        }
	      }

	      return coercedValues;
	    }

	    var coercedValue = valueFromAST(valueNode, itemType, variables);

	    if (isInvalid(coercedValue)) {
	      return; // Invalid: intentionally return no value.
	    }

	    return [coercedValue];
	  }

	  if (isInputObjectType(type)) {
	    if (valueNode.kind !== Kind.OBJECT) {
	      return; // Invalid: intentionally return no value.
	    }

	    var coercedObj = Object.create(null);
	    var fieldNodes = keyMap(valueNode.fields, function (field) {
	      return field.name.value;
	    });

	    for (var _i4 = 0, _objectValues2 = objectValues(type.getFields()); _i4 < _objectValues2.length; _i4++) {
	      var field = _objectValues2[_i4];
	      var fieldNode = fieldNodes[field.name];

	      if (!fieldNode || isMissingVariable(fieldNode.value, variables)) {
	        if (field.defaultValue !== undefined) {
	          coercedObj[field.name] = field.defaultValue;
	        } else if (isNonNullType(field.type)) {
	          return; // Invalid: intentionally return no value.
	        }

	        continue;
	      }

	      var fieldValue = valueFromAST(fieldNode.value, field.type, variables);

	      if (isInvalid(fieldValue)) {
	        return; // Invalid: intentionally return no value.
	      }

	      coercedObj[field.name] = fieldValue;
	    }

	    return coercedObj;
	  }

	  if (isEnumType(type)) {
	    if (valueNode.kind !== Kind.ENUM) {
	      return; // Invalid: intentionally return no value.
	    }

	    var enumValue = type.getValue(valueNode.value);

	    if (!enumValue) {
	      return; // Invalid: intentionally return no value.
	    }

	    return enumValue.value;
	  }

	  /* istanbul ignore else */
	  if (isScalarType(type)) {
	    // Scalars fulfill parsing a literal value via parseLiteral().
	    // Invalid values represent a failure to parse correctly, in which case
	    // no value is returned.
	    var result;

	    try {
	      result = type.parseLiteral(valueNode, variables);
	    } catch (_error) {
	      return; // Invalid: intentionally return no value.
	    }

	    if (isInvalid(result)) {
	      return; // Invalid: intentionally return no value.
	    }

	    return result;
	  } // Not reachable. All possible input types have been considered.


	  /* istanbul ignore next */
	  invariant(false, 'Unexpected input type: ' + inspect(type));
	} // Returns true if the provided valueNode is a variable which is not defined
	// in the set of variables.

	function isMissingVariable(valueNode, variables) {
	  return valueNode.kind === Kind.VARIABLE && (!variables || isInvalid(variables[valueNode.name.value]));
	}

	/**
	 * Coerces a JavaScript value given a GraphQL Input Type.
	 */
	function coerceInputValue(inputValue, type) {
	  var onError = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : defaultOnError;
	  return coerceInputValueImpl(inputValue, type, onError);
	}

	function defaultOnError(path, invalidValue, error) {
	  var errorPrefix = 'Invalid value ' + inspect(invalidValue);

	  if (path.length > 0) {
	    errorPrefix += " at \"value".concat(printPathArray(path), "\": ");
	  }

	  error.message = errorPrefix + ': ' + error.message;
	  throw error;
	}

	function coerceInputValueImpl(inputValue, type, onError, path) {
	  if (isNonNullType(type)) {
	    if (inputValue != null) {
	      return coerceInputValueImpl(inputValue, type.ofType, onError, path);
	    }

	    onError(pathToArray(path), inputValue, new GraphQLError("Expected non-nullable type ".concat(inspect(type), " not to be null.")));
	    return;
	  }

	  if (inputValue == null) {
	    // Explicitly return the value null.
	    return null;
	  }

	  if (isListType(type)) {
	    var itemType = type.ofType;

	    if (isCollection(inputValue)) {
	      var coercedValue = [];
	      forEach(inputValue, function (itemValue, index) {
	        coercedValue.push(coerceInputValueImpl(itemValue, itemType, onError, addPath(path, index)));
	      });
	      return coercedValue;
	    } // Lists accept a non-list value as a list of one.


	    return [coerceInputValueImpl(inputValue, itemType, onError, path)];
	  }

	  if (isInputObjectType(type)) {
	    if (!isObjectLike(inputValue)) {
	      onError(pathToArray(path), inputValue, new GraphQLError("Expected type ".concat(type.name, " to be an object.")));
	      return;
	    }

	    var _coercedValue = {};
	    var fieldDefs = type.getFields();

	    for (var _i2 = 0, _objectValues2 = objectValues(fieldDefs); _i2 < _objectValues2.length; _i2++) {
	      var field = _objectValues2[_i2];
	      var fieldValue = inputValue[field.name];

	      if (fieldValue === undefined) {
	        if (field.defaultValue !== undefined) {
	          _coercedValue[field.name] = field.defaultValue;
	        } else if (isNonNullType(field.type)) {
	          var typeStr = inspect(field.type);
	          onError(pathToArray(path), inputValue, new GraphQLError("Field ".concat(field.name, " of required type ").concat(typeStr, " was not provided.")));
	        }

	        continue;
	      }

	      _coercedValue[field.name] = coerceInputValueImpl(fieldValue, field.type, onError, addPath(path, field.name));
	    } // Ensure every provided field is defined.


	    for (var _i4 = 0, _Object$keys2 = Object.keys(inputValue); _i4 < _Object$keys2.length; _i4++) {
	      var fieldName = _Object$keys2[_i4];

	      if (!fieldDefs[fieldName]) {
	        var suggestions = suggestionList(fieldName, Object.keys(type.getFields()));
	        onError(pathToArray(path), inputValue, new GraphQLError("Field \"".concat(fieldName, "\" is not defined by type ").concat(type.name, ".") + didYouMean(suggestions)));
	      }
	    }

	    return _coercedValue;
	  }

	  if (isScalarType(type)) {
	    var parseResult; // Scalars determine if a input value is valid via parseValue(), which can
	    // throw to indicate failure. If it throws, maintain a reference to
	    // the original error.

	    try {
	      parseResult = type.parseValue(inputValue);
	    } catch (error) {
	      onError(pathToArray(path), inputValue, new GraphQLError("Expected type ".concat(type.name, ". ") + error.message, undefined, undefined, undefined, undefined, error));
	      return;
	    }

	    if (parseResult === undefined) {
	      onError(pathToArray(path), inputValue, new GraphQLError("Expected type ".concat(type.name, ".")));
	    }

	    return parseResult;
	  }

	  /* istanbul ignore else */
	  if (isEnumType(type)) {
	    if (typeof inputValue === 'string') {
	      var enumValue = type.getValue(inputValue);

	      if (enumValue) {
	        return enumValue.value;
	      }
	    }

	    var _suggestions = suggestionList(String(inputValue), type.getValues().map(function (enumValue) {
	      return enumValue.name;
	    }));

	    onError(pathToArray(path), inputValue, new GraphQLError("Expected type ".concat(type.name, ".") + didYouMean(_suggestions)));
	    return;
	  } // Not reachable. All possible input types have been considered.


	  /* istanbul ignore next */
	  invariant(false, 'Unexpected input type: ' + inspect(type));
	}

	/**
	 * Prepares an object map of variableValues of the correct type based on the
	 * provided variable definitions and arbitrary input. If the input cannot be
	 * parsed to match the variable definitions, a GraphQLError will be thrown.
	 *
	 * Note: The returned value is a plain Object with a prototype, since it is
	 * exposed to user code. Care should be taken to not pull values from the
	 * Object prototype.
	 */
	function getVariableValues(schema, varDefNodes, inputs, options) {
	  var maxErrors = options && options.maxErrors;
	  var errors = [];

	  try {
	    var coerced = coerceVariableValues(schema, varDefNodes, inputs, function (error) {
	      if (maxErrors != null && errors.length >= maxErrors) {
	        throw new GraphQLError('Too many errors processing variables, error limit reached. Execution aborted.');
	      }

	      errors.push(error);
	    });

	    if (errors.length === 0) {
	      return {
	        coerced: coerced
	      };
	    }
	  } catch (error) {
	    errors.push(error);
	  }

	  return {
	    errors: errors
	  };
	}

	function coerceVariableValues(schema, varDefNodes, inputs, onError) {
	  var coercedValues = {};

	  var _loop = function _loop(_i2) {
	    var varDefNode = varDefNodes[_i2];
	    var varName = varDefNode.variable.name.value;
	    var varType = typeFromAST(schema, varDefNode.type);

	    if (!isInputType(varType)) {
	      // Must use input types for variables. This should be caught during
	      // validation, however is checked again here for safety.
	      var varTypeStr = print(varDefNode.type);
	      onError(new GraphQLError("Variable \"$".concat(varName, "\" expected value of type \"").concat(varTypeStr, "\" which cannot be used as an input type."), varDefNode.type));
	      return "continue";
	    }

	    if (!hasOwnProperty$1(inputs, varName)) {
	      if (varDefNode.defaultValue) {
	        coercedValues[varName] = valueFromAST(varDefNode.defaultValue, varType);
	      } else if (isNonNullType(varType)) {
	        var _varTypeStr = inspect(varType);

	        onError(new GraphQLError("Variable \"$".concat(varName, "\" of required type \"").concat(_varTypeStr, "\" was not provided."), varDefNode));
	      }

	      return "continue";
	    }

	    var value = inputs[varName];

	    if (value === null && isNonNullType(varType)) {
	      var _varTypeStr2 = inspect(varType);

	      onError(new GraphQLError("Variable \"$".concat(varName, "\" of non-null type \"").concat(_varTypeStr2, "\" must not be null."), varDefNode));
	      return "continue";
	    }

	    coercedValues[varName] = coerceInputValue(value, varType, function (path, invalidValue, error) {
	      var prefix = "Variable \"$".concat(varName, "\" got invalid value ") + inspect(invalidValue);

	      if (path.length > 0) {
	        prefix += " at \"".concat(varName).concat(printPathArray(path), "\"");
	      }

	      onError(new GraphQLError(prefix + '; ' + error.message, varDefNode, undefined, undefined, undefined, error.originalError));
	    });
	  };

	  for (var _i2 = 0; _i2 < varDefNodes.length; _i2++) {
	    var _ret = _loop(_i2);

	    if (_ret === "continue") continue;
	  }

	  return coercedValues;
	}
	/**
	 * Prepares an object map of argument values given a list of argument
	 * definitions and list of argument AST nodes.
	 *
	 * Note: The returned value is a plain Object with a prototype, since it is
	 * exposed to user code. Care should be taken to not pull values from the
	 * Object prototype.
	 */


	function getArgumentValues(def, node, variableValues) {
	  var coercedValues = {};
	  var argNodeMap = keyMap(node.arguments || [], function (arg) {
	    return arg.name.value;
	  });

	  for (var _i4 = 0, _def$args2 = def.args; _i4 < _def$args2.length; _i4++) {
	    var argDef = _def$args2[_i4];
	    var name = argDef.name;
	    var argType = argDef.type;
	    var argumentNode = argNodeMap[name];

	    if (!argumentNode) {
	      if (argDef.defaultValue !== undefined) {
	        coercedValues[name] = argDef.defaultValue;
	      } else if (isNonNullType(argType)) {
	        throw new GraphQLError("Argument \"".concat(name, "\" of required type \"").concat(inspect(argType), "\" ") + 'was not provided.', node);
	      }

	      continue;
	    }

	    var valueNode = argumentNode.value;
	    var isNull = valueNode.kind === Kind.NULL;

	    if (valueNode.kind === Kind.VARIABLE) {
	      var variableName = valueNode.name.value;

	      if (variableValues == null || !hasOwnProperty$1(variableValues, variableName)) {
	        if (argDef.defaultValue !== undefined) {
	          coercedValues[name] = argDef.defaultValue;
	        } else if (isNonNullType(argType)) {
	          throw new GraphQLError("Argument \"".concat(name, "\" of required type \"").concat(inspect(argType), "\" ") + "was provided the variable \"$".concat(variableName, "\" which was not provided a runtime value."), valueNode);
	        }

	        continue;
	      }

	      isNull = variableValues[variableName] == null;
	    }

	    if (isNull && isNonNullType(argType)) {
	      throw new GraphQLError("Argument \"".concat(name, "\" of non-null type \"").concat(inspect(argType), "\" ") + 'must not be null.', valueNode);
	    }

	    var coercedValue = valueFromAST(valueNode, argType, variableValues);

	    if (coercedValue === undefined) {
	      // Note: ValuesOfCorrectType validation should catch this before
	      // execution. This is a runtime check to ensure execution does not
	      // continue with an invalid argument value.
	      throw new GraphQLError("Argument \"".concat(name, "\" has invalid value ").concat(print(valueNode), "."), valueNode);
	    }

	    coercedValues[name] = coercedValue;
	  }

	  return coercedValues;
	}
	/**
	 * Prepares an object map of argument values given a directive definition
	 * and a AST node which may contain directives. Optionally also accepts a map
	 * of variable values.
	 *
	 * If the directive does not exist on the node, returns undefined.
	 *
	 * Note: The returned value is a plain Object with a prototype, since it is
	 * exposed to user code. Care should be taken to not pull values from the
	 * Object prototype.
	 */

	function getDirectiveValues(directiveDef, node, variableValues) {
	  var directiveNode = node.directives && find(node.directives, function (directive) {
	    return directive.name.value === directiveDef.name;
	  });

	  if (directiveNode) {
	    return getArgumentValues(directiveDef, directiveNode, variableValues);
	  }
	}

	function hasOwnProperty$1(obj, prop) {
	  return Object.prototype.hasOwnProperty.call(obj, prop);
	}

	/**
	 * Terminology
	 *
	 * "Definitions" are the generic name for top-level statements in the document.
	 * Examples of this include:
	 * 1) Operations (such as a query)
	 * 2) Fragments
	 *
	 * "Operations" are a generic name for requests in the document.
	 * Examples of this include:
	 * 1) query,
	 * 2) mutation
	 *
	 * "Selections" are the definitions that can appear legally and at
	 * single level of the query. These include:
	 * 1) field references e.g "a"
	 * 2) fragment "spreads" e.g. "...c"
	 * 3) inline fragment "spreads" e.g. "...on Type { a }"
	 */

	/**
	 * Data that must be available at all points during query execution.
	 *
	 * Namely, schema of the type system that is currently executing,
	 * and the fragments defined in the query document
	 */

	function execute(argsOrSchema, document, rootValue, contextValue, variableValues, operationName, fieldResolver, typeResolver) {
	  /* eslint-enable no-redeclare */
	  // Extract arguments from object args if provided.
	  return arguments.length === 1 ? executeImpl(argsOrSchema) : executeImpl({
	    schema: argsOrSchema,
	    document: document,
	    rootValue: rootValue,
	    contextValue: contextValue,
	    variableValues: variableValues,
	    operationName: operationName,
	    fieldResolver: fieldResolver,
	    typeResolver: typeResolver
	  });
	}

	function executeImpl(args) {
	  var schema = args.schema,
	      document = args.document,
	      rootValue = args.rootValue,
	      contextValue = args.contextValue,
	      variableValues = args.variableValues,
	      operationName = args.operationName,
	      fieldResolver = args.fieldResolver,
	      typeResolver = args.typeResolver; // If arguments are missing or incorrect, throw an error.

	  assertValidExecutionArguments(schema, document, variableValues); // If a valid execution context cannot be created due to incorrect arguments,
	  // a "Response" with only errors is returned.

	  var exeContext = buildExecutionContext(schema, document, rootValue, contextValue, variableValues, operationName, fieldResolver, typeResolver); // Return early errors if execution context failed.

	  if (Array.isArray(exeContext)) {
	    return {
	      errors: exeContext
	    };
	  } // Return a Promise that will eventually resolve to the data described by
	  // The "Response" section of the GraphQL specification.
	  //
	  // If errors are encountered while executing a GraphQL field, only that
	  // field and its descendants will be omitted, and sibling fields will still
	  // be executed. An execution which encounters errors will still result in a
	  // resolved Promise.


	  var data = executeOperation(exeContext, exeContext.operation, rootValue);
	  return buildResponse(exeContext, data);
	}
	/**
	 * Given a completed execution context and data, build the { errors, data }
	 * response defined by the "Response" section of the GraphQL specification.
	 */


	function buildResponse(exeContext, data) {
	  if (isPromise(data)) {
	    return data.then(function (resolved) {
	      return buildResponse(exeContext, resolved);
	    });
	  }

	  return exeContext.errors.length === 0 ? {
	    data: data
	  } : {
	    errors: exeContext.errors,
	    data: data
	  };
	}
	/**
	 * Essential assertions before executing to provide developer feedback for
	 * improper use of the GraphQL library.
	 */


	function assertValidExecutionArguments(schema, document, rawVariableValues) {
	  document || devAssert(0, 'Must provide document'); // If the schema used for execution is invalid, throw an error.

	  assertValidSchema(schema); // Variables, if provided, must be an object.

	  rawVariableValues == null || isObjectLike(rawVariableValues) || devAssert(0, 'Variables must be provided as an Object where each property is a variable value. Perhaps look to see if an unparsed JSON string was provided.');
	}
	/**
	 * Constructs a ExecutionContext object from the arguments passed to
	 * execute, which we will pass throughout the other execution methods.
	 *
	 * Throws a GraphQLError if a valid execution context cannot be created.
	 */

	function buildExecutionContext(schema, document, rootValue, contextValue, rawVariableValues, operationName, fieldResolver, typeResolver) {
	  var operation;
	  var hasMultipleAssumedOperations = false;
	  var fragments = Object.create(null);

	  for (var _i2 = 0, _document$definitions2 = document.definitions; _i2 < _document$definitions2.length; _i2++) {
	    var definition = _document$definitions2[_i2];

	    switch (definition.kind) {
	      case Kind.OPERATION_DEFINITION:
	        if (!operationName && operation) {
	          hasMultipleAssumedOperations = true;
	        } else if (!operationName || definition.name && definition.name.value === operationName) {
	          operation = definition;
	        }

	        break;

	      case Kind.FRAGMENT_DEFINITION:
	        fragments[definition.name.value] = definition;
	        break;
	    }
	  }

	  if (!operation) {
	    if (operationName) {
	      return [new GraphQLError("Unknown operation named \"".concat(operationName, "\"."))];
	    }

	    return [new GraphQLError('Must provide an operation.')];
	  }

	  if (hasMultipleAssumedOperations) {
	    return [new GraphQLError('Must provide operation name if query contains multiple operations.')];
	  }

	  var coercedVariableValues = getVariableValues(schema, operation.variableDefinitions || [], rawVariableValues || {}, {
	    maxErrors: 50
	  });

	  if (coercedVariableValues.errors) {
	    return coercedVariableValues.errors;
	  }

	  return {
	    schema: schema,
	    fragments: fragments,
	    rootValue: rootValue,
	    contextValue: contextValue,
	    operation: operation,
	    variableValues: coercedVariableValues.coerced,
	    fieldResolver: fieldResolver || defaultFieldResolver,
	    typeResolver: typeResolver || defaultTypeResolver,
	    errors: []
	  };
	}
	/**
	 * Implements the "Evaluating operations" section of the spec.
	 */

	function executeOperation(exeContext, operation, rootValue) {
	  var type = getOperationRootType(exeContext.schema, operation);
	  var fields = collectFields(exeContext, type, operation.selectionSet, Object.create(null), Object.create(null));
	  var path = undefined; // Errors from sub-fields of a NonNull type may propagate to the top level,
	  // at which point we still log the error and null the parent field, which
	  // in this case is the entire response.
	  //
	  // Similar to completeValueCatchingError.

	  try {
	    var result = operation.operation === 'mutation' ? executeFieldsSerially(exeContext, type, rootValue, path, fields) : executeFields(exeContext, type, rootValue, path, fields);

	    if (isPromise(result)) {
	      return result.then(undefined, function (error) {
	        exeContext.errors.push(error);
	        return Promise.resolve(null);
	      });
	    }

	    return result;
	  } catch (error) {
	    exeContext.errors.push(error);
	    return null;
	  }
	}
	/**
	 * Implements the "Evaluating selection sets" section of the spec
	 * for "write" mode.
	 */


	function executeFieldsSerially(exeContext, parentType, sourceValue, path, fields) {
	  return promiseReduce(Object.keys(fields), function (results, responseName) {
	    var fieldNodes = fields[responseName];
	    var fieldPath = addPath(path, responseName);
	    var result = resolveField(exeContext, parentType, sourceValue, fieldNodes, fieldPath);

	    if (result === undefined) {
	      return results;
	    }

	    if (isPromise(result)) {
	      return result.then(function (resolvedResult) {
	        results[responseName] = resolvedResult;
	        return results;
	      });
	    }

	    results[responseName] = result;
	    return results;
	  }, Object.create(null));
	}
	/**
	 * Implements the "Evaluating selection sets" section of the spec
	 * for "read" mode.
	 */


	function executeFields(exeContext, parentType, sourceValue, path, fields) {
	  var results = Object.create(null);
	  var containsPromise = false;

	  for (var _i4 = 0, _Object$keys2 = Object.keys(fields); _i4 < _Object$keys2.length; _i4++) {
	    var responseName = _Object$keys2[_i4];
	    var fieldNodes = fields[responseName];
	    var fieldPath = addPath(path, responseName);
	    var result = resolveField(exeContext, parentType, sourceValue, fieldNodes, fieldPath);

	    if (result !== undefined) {
	      results[responseName] = result;

	      if (!containsPromise && isPromise(result)) {
	        containsPromise = true;
	      }
	    }
	  } // If there are no promises, we can just return the object


	  if (!containsPromise) {
	    return results;
	  } // Otherwise, results is a map from field name to the result of resolving that
	  // field, which is possibly a promise. Return a promise that will return this
	  // same map, but with any promises replaced with the values they resolved to.


	  return promiseForObject(results);
	}
	/**
	 * Given a selectionSet, adds all of the fields in that selection to
	 * the passed in map of fields, and returns it at the end.
	 *
	 * CollectFields requires the "runtime type" of an object. For a field which
	 * returns an Interface or Union type, the "runtime type" will be the actual
	 * Object type returned by that field.
	 */


	function collectFields(exeContext, runtimeType, selectionSet, fields, visitedFragmentNames) {
	  for (var _i6 = 0, _selectionSet$selecti2 = selectionSet.selections; _i6 < _selectionSet$selecti2.length; _i6++) {
	    var selection = _selectionSet$selecti2[_i6];

	    switch (selection.kind) {
	      case Kind.FIELD:
	        {
	          if (!shouldIncludeNode(exeContext, selection)) {
	            continue;
	          }

	          var name = getFieldEntryKey(selection);

	          if (!fields[name]) {
	            fields[name] = [];
	          }

	          fields[name].push(selection);
	          break;
	        }

	      case Kind.INLINE_FRAGMENT:
	        {
	          if (!shouldIncludeNode(exeContext, selection) || !doesFragmentConditionMatch(exeContext, selection, runtimeType)) {
	            continue;
	          }

	          collectFields(exeContext, runtimeType, selection.selectionSet, fields, visitedFragmentNames);
	          break;
	        }

	      case Kind.FRAGMENT_SPREAD:
	        {
	          var fragName = selection.name.value;

	          if (visitedFragmentNames[fragName] || !shouldIncludeNode(exeContext, selection)) {
	            continue;
	          }

	          visitedFragmentNames[fragName] = true;
	          var fragment = exeContext.fragments[fragName];

	          if (!fragment || !doesFragmentConditionMatch(exeContext, fragment, runtimeType)) {
	            continue;
	          }

	          collectFields(exeContext, runtimeType, fragment.selectionSet, fields, visitedFragmentNames);
	          break;
	        }
	    }
	  }

	  return fields;
	}
	/**
	 * Determines if a field should be included based on the @include and @skip
	 * directives, where @skip has higher precedence than @include.
	 */

	function shouldIncludeNode(exeContext, node) {
	  var skip = getDirectiveValues(GraphQLSkipDirective, node, exeContext.variableValues);

	  if (skip && skip.if === true) {
	    return false;
	  }

	  var include = getDirectiveValues(GraphQLIncludeDirective, node, exeContext.variableValues);

	  if (include && include.if === false) {
	    return false;
	  }

	  return true;
	}
	/**
	 * Determines if a fragment is applicable to the given type.
	 */


	function doesFragmentConditionMatch(exeContext, fragment, type) {
	  var typeConditionNode = fragment.typeCondition;

	  if (!typeConditionNode) {
	    return true;
	  }

	  var conditionalType = typeFromAST(exeContext.schema, typeConditionNode);

	  if (conditionalType === type) {
	    return true;
	  }

	  if (isAbstractType(conditionalType)) {
	    return exeContext.schema.isPossibleType(conditionalType, type);
	  }

	  return false;
	}
	/**
	 * Implements the logic to compute the key of a given field's entry
	 */


	function getFieldEntryKey(node) {
	  return node.alias ? node.alias.value : node.name.value;
	}
	/**
	 * Resolves the field on the given source object. In particular, this
	 * figures out the value that the field returns by calling its resolve function,
	 * then calls completeValue to complete promises, serialize scalars, or execute
	 * the sub-selection-set for objects.
	 */


	function resolveField(exeContext, parentType, source, fieldNodes, path) {
	  var fieldNode = fieldNodes[0];
	  var fieldName = fieldNode.name.value;
	  var fieldDef = getFieldDef$1(exeContext.schema, parentType, fieldName);

	  if (!fieldDef) {
	    return;
	  }

	  var resolveFn = fieldDef.resolve || exeContext.fieldResolver;
	  var info = buildResolveInfo(exeContext, fieldDef, fieldNodes, parentType, path); // Get the resolve function, regardless of if its result is normal
	  // or abrupt (error).

	  var result = resolveFieldValueOrError(exeContext, fieldDef, fieldNodes, resolveFn, source, info);
	  return completeValueCatchingError(exeContext, fieldDef.type, fieldNodes, info, path, result);
	}

	function buildResolveInfo(exeContext, fieldDef, fieldNodes, parentType, path) {
	  // The resolve function's optional fourth argument is a collection of
	  // information about the current execution state.
	  return {
	    fieldName: fieldDef.name,
	    fieldNodes: fieldNodes,
	    returnType: fieldDef.type,
	    parentType: parentType,
	    path: path,
	    schema: exeContext.schema,
	    fragments: exeContext.fragments,
	    rootValue: exeContext.rootValue,
	    operation: exeContext.operation,
	    variableValues: exeContext.variableValues
	  };
	} // Isolates the "ReturnOrAbrupt" behavior to not de-opt the `resolveField`
	// function. Returns the result of resolveFn or the abrupt-return Error object.

	function resolveFieldValueOrError(exeContext, fieldDef, fieldNodes, resolveFn, source, info) {
	  try {
	    // Build a JS object of arguments from the field.arguments AST, using the
	    // variables scope to fulfill any variable references.
	    // TODO: find a way to memoize, in case this field is within a List type.
	    var args = getArgumentValues(fieldDef, fieldNodes[0], exeContext.variableValues); // The resolve function's optional third argument is a context value that
	    // is provided to every resolve function within an execution. It is commonly
	    // used to represent an authenticated user, or request-specific caches.

	    var _contextValue = exeContext.contextValue;
	    var result = resolveFn(source, args, _contextValue, info);
	    return isPromise(result) ? result.then(undefined, asErrorInstance) : result;
	  } catch (error) {
	    return asErrorInstance(error);
	  }
	} // Sometimes a non-error is thrown, wrap it as an Error instance to ensure a
	// consistent Error interface.

	function asErrorInstance(error) {
	  if (error instanceof Error) {
	    return error;
	  }

	  return new Error('Unexpected error value: ' + inspect(error));
	} // This is a small wrapper around completeValue which detects and logs errors
	// in the execution context.


	function completeValueCatchingError(exeContext, returnType, fieldNodes, info, path, result) {
	  try {
	    var completed;

	    if (isPromise(result)) {
	      completed = result.then(function (resolved) {
	        return completeValue(exeContext, returnType, fieldNodes, info, path, resolved);
	      });
	    } else {
	      completed = completeValue(exeContext, returnType, fieldNodes, info, path, result);
	    }

	    if (isPromise(completed)) {
	      // Note: we don't rely on a `catch` method, but we do expect "thenable"
	      // to take a second callback for the error case.
	      return completed.then(undefined, function (error) {
	        return handleFieldError(error, fieldNodes, path, returnType, exeContext);
	      });
	    }

	    return completed;
	  } catch (error) {
	    return handleFieldError(error, fieldNodes, path, returnType, exeContext);
	  }
	}

	function handleFieldError(rawError, fieldNodes, path, returnType, exeContext) {
	  var error = locatedError(asErrorInstance(rawError), fieldNodes, pathToArray(path)); // If the field type is non-nullable, then it is resolved without any
	  // protection from errors, however it still properly locates the error.

	  if (isNonNullType(returnType)) {
	    throw error;
	  } // Otherwise, error protection is applied, logging the error and resolving
	  // a null value for this field if one is encountered.


	  exeContext.errors.push(error);
	  return null;
	}
	/**
	 * Implements the instructions for completeValue as defined in the
	 * "Field entries" section of the spec.
	 *
	 * If the field type is Non-Null, then this recursively completes the value
	 * for the inner type. It throws a field error if that completion returns null,
	 * as per the "Nullability" section of the spec.
	 *
	 * If the field type is a List, then this recursively completes the value
	 * for the inner type on each item in the list.
	 *
	 * If the field type is a Scalar or Enum, ensures the completed value is a legal
	 * value of the type by calling the `serialize` method of GraphQL type
	 * definition.
	 *
	 * If the field is an abstract type, determine the runtime type of the value
	 * and then complete based on that type
	 *
	 * Otherwise, the field type expects a sub-selection set, and will complete the
	 * value by evaluating all sub-selections.
	 */


	function completeValue(exeContext, returnType, fieldNodes, info, path, result) {
	  // If result is an Error, throw a located error.
	  if (result instanceof Error) {
	    throw result;
	  } // If field type is NonNull, complete for inner type, and throw field error
	  // if result is null.


	  if (isNonNullType(returnType)) {
	    var completed = completeValue(exeContext, returnType.ofType, fieldNodes, info, path, result);

	    if (completed === null) {
	      throw new Error("Cannot return null for non-nullable field ".concat(info.parentType.name, ".").concat(info.fieldName, "."));
	    }

	    return completed;
	  } // If result value is null-ish (null, undefined, or NaN) then return null.


	  if (isNullish(result)) {
	    return null;
	  } // If field type is List, complete each item in the list with the inner type


	  if (isListType(returnType)) {
	    return completeListValue(exeContext, returnType, fieldNodes, info, path, result);
	  } // If field type is a leaf type, Scalar or Enum, serialize to a valid value,
	  // returning null if serialization is not possible.


	  if (isLeafType(returnType)) {
	    return completeLeafValue(returnType, result);
	  } // If field type is an abstract type, Interface or Union, determine the
	  // runtime Object type and complete for that type.


	  if (isAbstractType(returnType)) {
	    return completeAbstractValue(exeContext, returnType, fieldNodes, info, path, result);
	  } // If field type is Object, execute and complete all sub-selections.


	  /* istanbul ignore else */
	  if (isObjectType(returnType)) {
	    return completeObjectValue(exeContext, returnType, fieldNodes, info, path, result);
	  } // Not reachable. All possible output types have been considered.


	  /* istanbul ignore next */
	  invariant(false, 'Cannot complete value of unexpected output type: ' + inspect(returnType));
	}
	/**
	 * Complete a list value by completing each item in the list with the
	 * inner type
	 */


	function completeListValue(exeContext, returnType, fieldNodes, info, path, result) {
	  if (!isCollection(result)) {
	    throw new GraphQLError("Expected Iterable, but did not find one for field ".concat(info.parentType.name, ".").concat(info.fieldName, "."));
	  } // This is specified as a simple map, however we're optimizing the path
	  // where the list contains no Promises by avoiding creating another Promise.


	  var itemType = returnType.ofType;
	  var containsPromise = false;
	  var completedResults = [];
	  forEach(result, function (item, index) {
	    // No need to modify the info object containing the path,
	    // since from here on it is not ever accessed by resolver functions.
	    var fieldPath = addPath(path, index);
	    var completedItem = completeValueCatchingError(exeContext, itemType, fieldNodes, info, fieldPath, item);

	    if (!containsPromise && isPromise(completedItem)) {
	      containsPromise = true;
	    }

	    completedResults.push(completedItem);
	  });
	  return containsPromise ? Promise.all(completedResults) : completedResults;
	}
	/**
	 * Complete a Scalar or Enum by serializing to a valid value, returning
	 * null if serialization is not possible.
	 */


	function completeLeafValue(returnType, result) {
	  var serializedResult = returnType.serialize(result);

	  if (isInvalid(serializedResult)) {
	    throw new Error("Expected a value of type \"".concat(inspect(returnType), "\" but ") + "received: ".concat(inspect(result)));
	  }

	  return serializedResult;
	}
	/**
	 * Complete a value of an abstract type by determining the runtime object type
	 * of that value, then complete the value for that type.
	 */


	function completeAbstractValue(exeContext, returnType, fieldNodes, info, path, result) {
	  var resolveTypeFn = returnType.resolveType || exeContext.typeResolver;
	  var contextValue = exeContext.contextValue;
	  var runtimeType = resolveTypeFn(result, contextValue, info, returnType);

	  if (isPromise(runtimeType)) {
	    return runtimeType.then(function (resolvedRuntimeType) {
	      return completeObjectValue(exeContext, ensureValidRuntimeType(resolvedRuntimeType, exeContext, returnType, fieldNodes, info, result), fieldNodes, info, path, result);
	    });
	  }

	  return completeObjectValue(exeContext, ensureValidRuntimeType(runtimeType, exeContext, returnType, fieldNodes, info, result), fieldNodes, info, path, result);
	}

	function ensureValidRuntimeType(runtimeTypeOrName, exeContext, returnType, fieldNodes, info, result) {
	  var runtimeType = typeof runtimeTypeOrName === 'string' ? exeContext.schema.getType(runtimeTypeOrName) : runtimeTypeOrName;

	  if (!isObjectType(runtimeType)) {
	    throw new GraphQLError("Abstract type ".concat(returnType.name, " must resolve to an Object type at runtime for field ").concat(info.parentType.name, ".").concat(info.fieldName, " with ") + "value ".concat(inspect(result), ", received \"").concat(inspect(runtimeType), "\". ") + "Either the ".concat(returnType.name, " type should provide a \"resolveType\" function or each possible type should provide an \"isTypeOf\" function."), fieldNodes);
	  }

	  if (!exeContext.schema.isPossibleType(returnType, runtimeType)) {
	    throw new GraphQLError("Runtime Object type \"".concat(runtimeType.name, "\" is not a possible type for \"").concat(returnType.name, "\"."), fieldNodes);
	  }

	  return runtimeType;
	}
	/**
	 * Complete an Object value by executing all sub-selections.
	 */


	function completeObjectValue(exeContext, returnType, fieldNodes, info, path, result) {
	  // If there is an isTypeOf predicate function, call it with the
	  // current result. If isTypeOf returns false, then raise an error rather
	  // than continuing execution.
	  if (returnType.isTypeOf) {
	    var isTypeOf = returnType.isTypeOf(result, exeContext.contextValue, info);

	    if (isPromise(isTypeOf)) {
	      return isTypeOf.then(function (resolvedIsTypeOf) {
	        if (!resolvedIsTypeOf) {
	          throw invalidReturnTypeError(returnType, result, fieldNodes);
	        }

	        return collectAndExecuteSubfields(exeContext, returnType, fieldNodes, path, result);
	      });
	    }

	    if (!isTypeOf) {
	      throw invalidReturnTypeError(returnType, result, fieldNodes);
	    }
	  }

	  return collectAndExecuteSubfields(exeContext, returnType, fieldNodes, path, result);
	}

	function invalidReturnTypeError(returnType, result, fieldNodes) {
	  return new GraphQLError("Expected value of type \"".concat(returnType.name, "\" but got: ").concat(inspect(result), "."), fieldNodes);
	}

	function collectAndExecuteSubfields(exeContext, returnType, fieldNodes, path, result) {
	  // Collect sub-fields to execute to complete this value.
	  var subFieldNodes = collectSubfields(exeContext, returnType, fieldNodes);
	  return executeFields(exeContext, returnType, result, path, subFieldNodes);
	}
	/**
	 * A memoized collection of relevant subfields with regard to the return
	 * type. Memoizing ensures the subfields are not repeatedly calculated, which
	 * saves overhead when resolving lists of values.
	 */


	var collectSubfields = memoize3(_collectSubfields);

	function _collectSubfields(exeContext, returnType, fieldNodes) {
	  var subFieldNodes = Object.create(null);
	  var visitedFragmentNames = Object.create(null);

	  for (var _i8 = 0; _i8 < fieldNodes.length; _i8++) {
	    var node = fieldNodes[_i8];

	    if (node.selectionSet) {
	      subFieldNodes = collectFields(exeContext, returnType, node.selectionSet, subFieldNodes, visitedFragmentNames);
	    }
	  }

	  return subFieldNodes;
	}
	/**
	 * If a resolveType function is not given, then a default resolve behavior is
	 * used which attempts two strategies:
	 *
	 * First, See if the provided value has a `__typename` field defined, if so, use
	 * that value as name of the resolved type.
	 *
	 * Otherwise, test each possible type for the abstract type by calling
	 * isTypeOf for the object being coerced, returning the first type that matches.
	 */


	var defaultTypeResolver = function defaultTypeResolver(value, contextValue, info, abstractType) {
	  // First, look for `__typename`.
	  if (isObjectLike(value) && typeof value.__typename === 'string') {
	    return value.__typename;
	  } // Otherwise, test each possible type.


	  var possibleTypes = info.schema.getPossibleTypes(abstractType);
	  var promisedIsTypeOfResults = [];

	  for (var i = 0; i < possibleTypes.length; i++) {
	    var type = possibleTypes[i];

	    if (type.isTypeOf) {
	      var isTypeOfResult = type.isTypeOf(value, contextValue, info);

	      if (isPromise(isTypeOfResult)) {
	        promisedIsTypeOfResults[i] = isTypeOfResult;
	      } else if (isTypeOfResult) {
	        return type;
	      }
	    }
	  }

	  if (promisedIsTypeOfResults.length) {
	    return Promise.all(promisedIsTypeOfResults).then(function (isTypeOfResults) {
	      for (var _i9 = 0; _i9 < isTypeOfResults.length; _i9++) {
	        if (isTypeOfResults[_i9]) {
	          return possibleTypes[_i9];
	        }
	      }
	    });
	  }
	};
	/**
	 * If a resolve function is not given, then a default resolve behavior is used
	 * which takes the property of the source object of the same name as the field
	 * and returns it as the result, or if it's a function, returns the result
	 * of calling that function while passing along args and context value.
	 */

	var defaultFieldResolver = function defaultFieldResolver(source, args, contextValue, info) {
	  // ensure source is a value for which property access is acceptable.
	  if (isObjectLike(source) || typeof source === 'function') {
	    var property = source[info.fieldName];

	    if (typeof property === 'function') {
	      return source[info.fieldName](args, contextValue, info);
	    }

	    return property;
	  }
	};
	/**
	 * This method looks up the field on the given type definition.
	 * It has special casing for the two introspection fields, __schema
	 * and __typename. __typename is special because it can always be
	 * queried as a field, even in situations where no other fields
	 * are allowed, like on a Union. __schema could get automatically
	 * added to the query type, but that would require mutating type
	 * definitions, which would cause issues.
	 */

	function getFieldDef$1(schema, parentType, fieldName) {
	  if (fieldName === SchemaMetaFieldDef.name && schema.getQueryType() === parentType) {
	    return SchemaMetaFieldDef;
	  } else if (fieldName === TypeMetaFieldDef.name && schema.getQueryType() === parentType) {
	    return TypeMetaFieldDef;
	  } else if (fieldName === TypeNameMetaFieldDef.name) {
	    return TypeNameMetaFieldDef;
	  }

	  return parentType.getFields()[fieldName];
	}

	/**
	 * This is the primary entry point function for fulfilling GraphQL operations
	 * by parsing, validating, and executing a GraphQL document along side a
	 * GraphQL schema.
	 *
	 * More sophisticated GraphQL servers, such as those which persist queries,
	 * may wish to separate the validation and execution phases to a static time
	 * tooling step, and a server runtime step.
	 *
	 * Accepts either an object with named arguments, or individual arguments:
	 *
	 * schema:
	 *    The GraphQL type system to use when validating and executing a query.
	 * source:
	 *    A GraphQL language formatted string representing the requested operation.
	 * rootValue:
	 *    The value provided as the first argument to resolver functions on the top
	 *    level type (e.g. the query object type).
	 * contextValue:
	 *    The context value is provided as an argument to resolver functions after
	 *    field arguments. It is used to pass shared information useful at any point
	 *    during executing this query, for example the currently logged in user and
	 *    connections to databases or other services.
	 * variableValues:
	 *    A mapping of variable name to runtime value to use for all variables
	 *    defined in the requestString.
	 * operationName:
	 *    The name of the operation to use if requestString contains multiple
	 *    possible operations. Can be omitted if requestString contains only
	 *    one operation.
	 * fieldResolver:
	 *    A resolver function to use when one is not provided by the schema.
	 *    If not provided, the default field resolver is used (which looks for a
	 *    value or method on the source value with the field's name).
	 * typeResolver:
	 *    A type resolver function to use when none is provided by the schema.
	 *    If not provided, the default type resolver is used (which looks for a
	 *    `__typename` field or alternatively calls the `isTypeOf` method).
	 */

	function graphql(argsOrSchema, source, rootValue, contextValue, variableValues, operationName, fieldResolver, typeResolver) {
	  var _arguments = arguments;

	  /* eslint-enable no-redeclare */
	  // Always return a Promise for a consistent API.
	  return new Promise(function (resolve) {
	    return resolve( // Extract arguments from object args if provided.
	    _arguments.length === 1 ? graphqlImpl(argsOrSchema) : graphqlImpl({
	      schema: argsOrSchema,
	      source: source,
	      rootValue: rootValue,
	      contextValue: contextValue,
	      variableValues: variableValues,
	      operationName: operationName,
	      fieldResolver: fieldResolver,
	      typeResolver: typeResolver
	    }));
	  });
	}
	/**
	 * The graphqlSync function also fulfills GraphQL operations by parsing,
	 * validating, and executing a GraphQL document along side a GraphQL schema.
	 * However, it guarantees to complete synchronously (or throw an error) assuming
	 * that all field resolvers are also synchronous.
	 */

	function graphqlSync(argsOrSchema, source, rootValue, contextValue, variableValues, operationName, fieldResolver, typeResolver) {
	  /* eslint-enable no-redeclare */
	  // Extract arguments from object args if provided.
	  var result = arguments.length === 1 ? graphqlImpl(argsOrSchema) : graphqlImpl({
	    schema: argsOrSchema,
	    source: source,
	    rootValue: rootValue,
	    contextValue: contextValue,
	    variableValues: variableValues,
	    operationName: operationName,
	    fieldResolver: fieldResolver,
	    typeResolver: typeResolver
	  }); // Assert that the execution was synchronous.

	  if (isPromise(result)) {
	    throw new Error('GraphQL execution failed to complete synchronously.');
	  }

	  return result;
	}

	function graphqlImpl(args) {
	  var schema = args.schema,
	      source = args.source,
	      rootValue = args.rootValue,
	      contextValue = args.contextValue,
	      variableValues = args.variableValues,
	      operationName = args.operationName,
	      fieldResolver = args.fieldResolver,
	      typeResolver = args.typeResolver; // Validate Schema

	  var schemaValidationErrors = validateSchema(schema);

	  if (schemaValidationErrors.length > 0) {
	    return {
	      errors: schemaValidationErrors
	    };
	  } // Parse


	  var document;

	  try {
	    document = parse(source);
	  } catch (syntaxError) {
	    return {
	      errors: [syntaxError]
	    };
	  } // Validate


	  var validationErrors = validate(schema, document);

	  if (validationErrors.length > 0) {
	    return {
	      errors: validationErrors
	    };
	  } // Execute


	  return execute({
	    schema: schema,
	    document: document,
	    rootValue: rootValue,
	    contextValue: contextValue,
	    variableValues: variableValues,
	    operationName: operationName,
	    fieldResolver: fieldResolver,
	    typeResolver: typeResolver
	  });
	}

	function _defineProperty$4(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

	/**
	 * Given an AsyncIterable and a callback function, return an AsyncIterator
	 * which produces values mapped via calling the callback function.
	 */
	function mapAsyncIterator(iterable, callback, rejectCallback) {
	  var iterator = getAsyncIterator(iterable);
	  var $return;
	  var abruptClose; // $FlowFixMe(>=0.68.0)

	  if (typeof iterator.return === 'function') {
	    $return = iterator.return;

	    abruptClose = function abruptClose(error) {
	      var rethrow = function rethrow() {
	        return Promise.reject(error);
	      };

	      return $return.call(iterator).then(rethrow, rethrow);
	    };
	  }

	  function mapResult(result) {
	    return result.done ? result : asyncMapValue(result.value, callback).then(iteratorResult, abruptClose);
	  }

	  var mapReject;

	  if (rejectCallback) {
	    // Capture rejectCallback to ensure it cannot be null.
	    var reject = rejectCallback;

	    mapReject = function mapReject(error) {
	      return asyncMapValue(error, reject).then(iteratorResult, abruptClose);
	    };
	  }
	  /* TODO: Flow doesn't support symbols as keys:
	     https://github.com/facebook/flow/issues/3258 */


	  return _defineProperty$4({
	    next: function next() {
	      return iterator.next().then(mapResult, mapReject);
	    },
	    return: function _return() {
	      return $return ? $return.call(iterator).then(mapResult, mapReject) : Promise.resolve({
	        value: undefined,
	        done: true
	      });
	    },
	    throw: function _throw(error) {
	      // $FlowFixMe(>=0.68.0)
	      if (typeof iterator.throw === 'function') {
	        return iterator.throw(error).then(mapResult, mapReject);
	      }

	      return Promise.reject(error).catch(abruptClose);
	    }
	  }, $$asyncIterator, function () {
	    return this;
	  });
	}

	function asyncMapValue(value, callback) {
	  return new Promise(function (resolve) {
	    return resolve(callback(value));
	  });
	}

	function iteratorResult(value) {
	  return {
	    value: value,
	    done: false
	  };
	}

	function subscribe(argsOrSchema, document, rootValue, contextValue, variableValues, operationName, fieldResolver, subscribeFieldResolver) {
	  /* eslint-enable no-redeclare */
	  // Extract arguments from object args if provided.
	  return arguments.length === 1 ? subscribeImpl(argsOrSchema) : subscribeImpl({
	    schema: argsOrSchema,
	    document: document,
	    rootValue: rootValue,
	    contextValue: contextValue,
	    variableValues: variableValues,
	    operationName: operationName,
	    fieldResolver: fieldResolver,
	    subscribeFieldResolver: subscribeFieldResolver
	  });
	}
	/**
	 * This function checks if the error is a GraphQLError. If it is, report it as
	 * an ExecutionResult, containing only errors and no data. Otherwise treat the
	 * error as a system-class error and re-throw it.
	 */

	function reportGraphQLError(error) {
	  if (error instanceof GraphQLError) {
	    return {
	      errors: [error]
	    };
	  }

	  throw error;
	}

	function subscribeImpl(args) {
	  var schema = args.schema,
	      document = args.document,
	      rootValue = args.rootValue,
	      contextValue = args.contextValue,
	      variableValues = args.variableValues,
	      operationName = args.operationName,
	      fieldResolver = args.fieldResolver,
	      subscribeFieldResolver = args.subscribeFieldResolver;
	  var sourcePromise = createSourceEventStream(schema, document, rootValue, contextValue, variableValues, operationName, subscribeFieldResolver); // For each payload yielded from a subscription, map it over the normal
	  // GraphQL `execute` function, with `payload` as the rootValue.
	  // This implements the "MapSourceToResponseEvent" algorithm described in
	  // the GraphQL specification. The `execute` function provides the
	  // "ExecuteSubscriptionEvent" algorithm, as it is nearly identical to the
	  // "ExecuteQuery" algorithm, for which `execute` is also used.

	  var mapSourceToResponse = function mapSourceToResponse(payload) {
	    return execute(schema, document, payload, contextValue, variableValues, operationName, fieldResolver);
	  }; // Resolve the Source Stream, then map every source value to a
	  // ExecutionResult value as described above.


	  return sourcePromise.then(function (resultOrStream) {
	    return (// Note: Flow can't refine isAsyncIterable, so explicit casts are used.
	      isAsyncIterable(resultOrStream) ? mapAsyncIterator(resultOrStream, mapSourceToResponse, reportGraphQLError) : resultOrStream
	    );
	  });
	}
	/**
	 * Implements the "CreateSourceEventStream" algorithm described in the
	 * GraphQL specification, resolving the subscription source event stream.
	 *
	 * Returns a Promise which resolves to either an AsyncIterable (if successful)
	 * or an ExecutionResult (error). The promise will be rejected if the schema or
	 * other arguments to this function are invalid, or if the resolved event stream
	 * is not an async iterable.
	 *
	 * If the client-provided arguments to this function do not result in a
	 * compliant subscription, a GraphQL Response (ExecutionResult) with
	 * descriptive errors and no data will be returned.
	 *
	 * If the the source stream could not be created due to faulty subscription
	 * resolver logic or underlying systems, the promise will resolve to a single
	 * ExecutionResult containing `errors` and no `data`.
	 *
	 * If the operation succeeded, the promise resolves to the AsyncIterable for the
	 * event stream returned by the resolver.
	 *
	 * A Source Event Stream represents a sequence of events, each of which triggers
	 * a GraphQL execution for that event.
	 *
	 * This may be useful when hosting the stateful subscription service in a
	 * different process or machine than the stateless GraphQL execution engine,
	 * or otherwise separating these two steps. For more on this, see the
	 * "Supporting Subscriptions at Scale" information in the GraphQL specification.
	 */


	function createSourceEventStream(schema, document, rootValue, contextValue, variableValues, operationName, fieldResolver) {
	  // If arguments are missing or incorrectly typed, this is an internal
	  // developer mistake which should throw an early error.
	  assertValidExecutionArguments(schema, document, variableValues);

	  try {
	    // If a valid context cannot be created due to incorrect arguments,
	    // this will throw an error.
	    var exeContext = buildExecutionContext(schema, document, rootValue, contextValue, variableValues, operationName, fieldResolver); // Return early errors if execution context failed.

	    if (Array.isArray(exeContext)) {
	      return Promise.resolve({
	        errors: exeContext
	      });
	    }

	    var type = getOperationRootType(schema, exeContext.operation);
	    var fields = collectFields(exeContext, type, exeContext.operation.selectionSet, Object.create(null), Object.create(null));
	    var responseNames = Object.keys(fields);
	    var responseName = responseNames[0];
	    var fieldNodes = fields[responseName];
	    var fieldNode = fieldNodes[0];
	    var fieldName = fieldNode.name.value;
	    var fieldDef = getFieldDef$1(schema, type, fieldName);

	    if (!fieldDef) {
	      throw new GraphQLError("The subscription field \"".concat(fieldName, "\" is not defined."), fieldNodes);
	    } // Call the `subscribe()` resolver or the default resolver to produce an
	    // AsyncIterable yielding raw payloads.


	    var resolveFn = fieldDef.subscribe || exeContext.fieldResolver;
	    var path = addPath(undefined, responseName);
	    var info = buildResolveInfo(exeContext, fieldDef, fieldNodes, type, path); // resolveFieldValueOrError implements the "ResolveFieldEventStream"
	    // algorithm from GraphQL specification. It differs from
	    // "ResolveFieldValue" due to providing a different `resolveFn`.

	    var result = resolveFieldValueOrError(exeContext, fieldDef, fieldNodes, resolveFn, rootValue, info); // Coerce to Promise for easier error handling and consistent return type.

	    return Promise.resolve(result).then(function (eventStream) {
	      // If eventStream is an Error, rethrow a located error.
	      if (eventStream instanceof Error) {
	        return {
	          errors: [locatedError(eventStream, fieldNodes, pathToArray(path))]
	        };
	      } // Assert field returned an event stream, otherwise yield an error.


	      if (isAsyncIterable(eventStream)) {
	        // Note: isAsyncIterable above ensures this will be correct.
	        return eventStream;
	      }

	      throw new Error('Subscription field must return Async Iterable. Received: ' + inspect(eventStream));
	    });
	  } catch (error) {
	    // As with reportGraphQLError above, if the error is a GraphQLError, report
	    // it as an ExecutionResult; otherwise treat it as a system-class error and
	    // re-throw it.
	    return error instanceof GraphQLError ? Promise.resolve({
	      errors: [error]
	    }) : Promise.reject(error);
	  }
	}

	var validation = /*#__PURE__*/Object.freeze({
		__proto__: null,
		validate: validate,
		ValidationContext: ValidationContext,
		specifiedRules: specifiedRules,
		ExecutableDefinitionsRule: ExecutableDefinitions,
		FieldsOnCorrectTypeRule: FieldsOnCorrectType,
		FragmentsOnCompositeTypesRule: FragmentsOnCompositeTypes,
		KnownArgumentNamesRule: KnownArgumentNames,
		KnownDirectivesRule: KnownDirectives,
		KnownFragmentNamesRule: KnownFragmentNames,
		KnownTypeNamesRule: KnownTypeNames,
		LoneAnonymousOperationRule: LoneAnonymousOperation,
		NoFragmentCyclesRule: NoFragmentCycles,
		NoUndefinedVariablesRule: NoUndefinedVariables,
		NoUnusedFragmentsRule: NoUnusedFragments,
		NoUnusedVariablesRule: NoUnusedVariables,
		OverlappingFieldsCanBeMergedRule: OverlappingFieldsCanBeMerged,
		PossibleFragmentSpreadsRule: PossibleFragmentSpreads,
		ProvidedRequiredArgumentsRule: ProvidedRequiredArguments,
		ScalarLeafsRule: ScalarLeafs,
		SingleFieldSubscriptionsRule: SingleFieldSubscriptions,
		UniqueArgumentNamesRule: UniqueArgumentNames,
		UniqueDirectivesPerLocationRule: UniqueDirectivesPerLocation,
		UniqueFragmentNamesRule: UniqueFragmentNames,
		UniqueInputFieldNamesRule: UniqueInputFieldNames,
		UniqueOperationNamesRule: UniqueOperationNames,
		UniqueVariableNamesRule: UniqueVariableNames,
		ValuesOfCorrectTypeRule: ValuesOfCorrectType,
		VariablesAreInputTypesRule: VariablesAreInputTypes,
		VariablesInAllowedPositionRule: VariablesInAllowedPosition,
		LoneSchemaDefinitionRule: LoneSchemaDefinition,
		UniqueOperationTypesRule: UniqueOperationTypes,
		UniqueTypeNamesRule: UniqueTypeNames,
		UniqueEnumValueNamesRule: UniqueEnumValueNames,
		UniqueFieldDefinitionNamesRule: UniqueFieldDefinitionNames,
		UniqueDirectiveNamesRule: UniqueDirectiveNames,
		PossibleTypeExtensionsRule: PossibleTypeExtensions
	});

	/**
	 * Given a GraphQLError, format it according to the rules described by the
	 * Response Format, Errors section of the GraphQL Specification.
	 */
	function formatError(error) {
	  error || devAssert(0, 'Received null or undefined error.');
	  var message = error.message || 'An unknown error occurred.';
	  var locations = error.locations;
	  var path = error.path;
	  var extensions = error.extensions;
	  return extensions ? {
	    message: message,
	    locations: locations,
	    path: path,
	    extensions: extensions
	  } : {
	    message: message,
	    locations: locations,
	    path: path
	  };
	}
	/**
	 * @see https://github.com/graphql/graphql-spec/blob/master/spec/Section%207%20--%20Response.md#errors
	 */

	function getIntrospectionQuery(options) {
	  var descriptions = !(options && options.descriptions === false);
	  return "\n    query IntrospectionQuery {\n      __schema {\n        queryType { name }\n        mutationType { name }\n        subscriptionType { name }\n        types {\n          ...FullType\n        }\n        directives {\n          name\n          ".concat(descriptions ? 'description' : '', "\n          locations\n          args {\n            ...InputValue\n          }\n        }\n      }\n    }\n\n    fragment FullType on __Type {\n      kind\n      name\n      ").concat(descriptions ? 'description' : '', "\n      fields(includeDeprecated: true) {\n        name\n        ").concat(descriptions ? 'description' : '', "\n        args {\n          ...InputValue\n        }\n        type {\n          ...TypeRef\n        }\n        isDeprecated\n        deprecationReason\n      }\n      inputFields {\n        ...InputValue\n      }\n      interfaces {\n        ...TypeRef\n      }\n      enumValues(includeDeprecated: true) {\n        name\n        ").concat(descriptions ? 'description' : '', "\n        isDeprecated\n        deprecationReason\n      }\n      possibleTypes {\n        ...TypeRef\n      }\n    }\n\n    fragment InputValue on __InputValue {\n      name\n      ").concat(descriptions ? 'description' : '', "\n      type { ...TypeRef }\n      defaultValue\n    }\n\n    fragment TypeRef on __Type {\n      kind\n      name\n      ofType {\n        kind\n        name\n        ofType {\n          kind\n          name\n          ofType {\n            kind\n            name\n            ofType {\n              kind\n              name\n              ofType {\n                kind\n                name\n                ofType {\n                  kind\n                  name\n                  ofType {\n                    kind\n                    name\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  ");
	}
	/**
	 * Deprecated, call getIntrospectionQuery directly.
	 *
	 * This function will be removed in v15
	 */

	var introspectionQuery = getIntrospectionQuery();

	/**
	 * Returns an operation AST given a document AST and optionally an operation
	 * name. If a name is not provided, an operation is only returned if only one is
	 * provided in the document.
	 */
	function getOperationAST(documentAST, operationName) {
	  var operation = null;

	  for (var _i2 = 0, _documentAST$definiti2 = documentAST.definitions; _i2 < _documentAST$definiti2.length; _i2++) {
	    var definition = _documentAST$definiti2[_i2];

	    if (definition.kind === Kind.OPERATION_DEFINITION) {
	      if (!operationName) {
	        // If no operation name was provided, only return an Operation if there
	        // is one defined in the document. Upon encountering the second, return
	        // null.
	        if (operation) {
	          return null;
	        }

	        operation = definition;
	      } else if (definition.name && definition.name.value === operationName) {
	        return definition;
	      }
	    }
	  }

	  return operation;
	}

	/**
	 * Build an IntrospectionQuery from a GraphQLSchema
	 *
	 * IntrospectionQuery is useful for utilities that care about type and field
	 * relationships, but do not need to traverse through those relationships.
	 *
	 * This is the inverse of buildClientSchema. The primary use case is outside
	 * of the server context, for instance when doing schema comparisons.
	 */

	function introspectionFromSchema(schema, options) {
	  var queryAST = parse(getIntrospectionQuery(options));
	  var result = execute(schema, queryAST);

	  /* istanbul ignore next */
	  !isPromise(result) && !result.errors && result.data || invariant(0);
	  return result.data;
	}

	/**
	 * Build a GraphQLSchema for use by client tools.
	 *
	 * Given the result of a client running the introspection query, creates and
	 * returns a GraphQLSchema instance which can be then used with all graphql-js
	 * tools, but cannot be used to execute a query, as introspection does not
	 * represent the "resolver", "parse" or "serialize" functions or any other
	 * server-internal mechanisms.
	 *
	 * This function expects a complete introspection result. Don't forget to check
	 * the "errors" field of a server response before calling this function.
	 */
	function buildClientSchema(introspection, options) {
	  isObjectLike(introspection) && isObjectLike(introspection.__schema) || devAssert(0, 'Invalid or incomplete introspection result. Ensure that you are passing "data" property of introspection response and no "errors" was returned alongside: ' + inspect(introspection)); // Get the schema from the introspection result.

	  var schemaIntrospection = introspection.__schema; // Iterate through all types, getting the type definition for each.

	  var typeMap = keyValMap(schemaIntrospection.types, function (typeIntrospection) {
	    return typeIntrospection.name;
	  }, function (typeIntrospection) {
	    return buildType(typeIntrospection);
	  });

	  for (var _i2 = 0, _ref2 = [].concat(specifiedScalarTypes, introspectionTypes); _i2 < _ref2.length; _i2++) {
	    var stdType = _ref2[_i2];

	    if (typeMap[stdType.name]) {
	      typeMap[stdType.name] = stdType;
	    }
	  } // Get the root Query, Mutation, and Subscription types.


	  var queryType = schemaIntrospection.queryType ? getObjectType(schemaIntrospection.queryType) : null;
	  var mutationType = schemaIntrospection.mutationType ? getObjectType(schemaIntrospection.mutationType) : null;
	  var subscriptionType = schemaIntrospection.subscriptionType ? getObjectType(schemaIntrospection.subscriptionType) : null; // Get the directives supported by Introspection, assuming empty-set if
	  // directives were not queried for.

	  var directives = schemaIntrospection.directives ? schemaIntrospection.directives.map(buildDirective) : []; // Then produce and return a Schema with these types.

	  return new GraphQLSchema({
	    query: queryType,
	    mutation: mutationType,
	    subscription: subscriptionType,
	    types: objectValues(typeMap),
	    directives: directives,
	    assumeValid: options && options.assumeValid,
	    allowedLegacyNames: options && options.allowedLegacyNames
	  }); // Given a type reference in introspection, return the GraphQLType instance.
	  // preferring cached instances before building new instances.

	  function getType(typeRef) {
	    if (typeRef.kind === TypeKind.LIST) {
	      var itemRef = typeRef.ofType;

	      if (!itemRef) {
	        throw new Error('Decorated type deeper than introspection query.');
	      }

	      return GraphQLList(getType(itemRef));
	    }

	    if (typeRef.kind === TypeKind.NON_NULL) {
	      var nullableRef = typeRef.ofType;

	      if (!nullableRef) {
	        throw new Error('Decorated type deeper than introspection query.');
	      }

	      var nullableType = getType(nullableRef);
	      return GraphQLNonNull(assertNullableType(nullableType));
	    }

	    if (!typeRef.name) {
	      throw new Error('Unknown type reference: ' + inspect(typeRef));
	    }

	    return getNamedType(typeRef.name);
	  }

	  function getNamedType(typeName) {
	    var type = typeMap[typeName];

	    if (!type) {
	      throw new Error("Invalid or incomplete schema, unknown type: ".concat(typeName, ". Ensure that a full introspection query is used in order to build a client schema."));
	    }

	    return type;
	  }

	  function getInputType(typeRef) {
	    var type = getType(typeRef);

	    if (isInputType(type)) {
	      return type;
	    }

	    throw new Error('Introspection must provide input type for arguments, but received: ' + inspect(type) + '.');
	  }

	  function getOutputType(typeRef) {
	    var type = getType(typeRef);

	    if (isOutputType(type)) {
	      return type;
	    }

	    throw new Error('Introspection must provide output type for fields, but received: ' + inspect(type) + '.');
	  }

	  function getObjectType(typeRef) {
	    var type = getType(typeRef);
	    return assertObjectType(type);
	  }

	  function getInterfaceType(typeRef) {
	    var type = getType(typeRef);
	    return assertInterfaceType(type);
	  } // Given a type's introspection result, construct the correct
	  // GraphQLType instance.


	  function buildType(type) {
	    if (type && type.name && type.kind) {
	      switch (type.kind) {
	        case TypeKind.SCALAR:
	          return buildScalarDef(type);

	        case TypeKind.OBJECT:
	          return buildObjectDef(type);

	        case TypeKind.INTERFACE:
	          return buildInterfaceDef(type);

	        case TypeKind.UNION:
	          return buildUnionDef(type);

	        case TypeKind.ENUM:
	          return buildEnumDef(type);

	        case TypeKind.INPUT_OBJECT:
	          return buildInputObjectDef(type);
	      }
	    }

	    throw new Error('Invalid or incomplete introspection result. Ensure that a full introspection query is used in order to build a client schema:' + inspect(type));
	  }

	  function buildScalarDef(scalarIntrospection) {
	    return new GraphQLScalarType({
	      name: scalarIntrospection.name,
	      description: scalarIntrospection.description
	    });
	  }

	  function buildObjectDef(objectIntrospection) {
	    if (!objectIntrospection.interfaces) {
	      throw new Error('Introspection result missing interfaces: ' + inspect(objectIntrospection));
	    }

	    return new GraphQLObjectType({
	      name: objectIntrospection.name,
	      description: objectIntrospection.description,
	      interfaces: function interfaces() {
	        return objectIntrospection.interfaces.map(getInterfaceType);
	      },
	      fields: function fields() {
	        return buildFieldDefMap(objectIntrospection);
	      }
	    });
	  }

	  function buildInterfaceDef(interfaceIntrospection) {
	    return new GraphQLInterfaceType({
	      name: interfaceIntrospection.name,
	      description: interfaceIntrospection.description,
	      fields: function fields() {
	        return buildFieldDefMap(interfaceIntrospection);
	      }
	    });
	  }

	  function buildUnionDef(unionIntrospection) {
	    if (!unionIntrospection.possibleTypes) {
	      throw new Error('Introspection result missing possibleTypes: ' + inspect(unionIntrospection));
	    }

	    return new GraphQLUnionType({
	      name: unionIntrospection.name,
	      description: unionIntrospection.description,
	      types: function types() {
	        return unionIntrospection.possibleTypes.map(getObjectType);
	      }
	    });
	  }

	  function buildEnumDef(enumIntrospection) {
	    if (!enumIntrospection.enumValues) {
	      throw new Error('Introspection result missing enumValues: ' + inspect(enumIntrospection));
	    }

	    return new GraphQLEnumType({
	      name: enumIntrospection.name,
	      description: enumIntrospection.description,
	      values: keyValMap(enumIntrospection.enumValues, function (valueIntrospection) {
	        return valueIntrospection.name;
	      }, function (valueIntrospection) {
	        return {
	          description: valueIntrospection.description,
	          deprecationReason: valueIntrospection.deprecationReason
	        };
	      })
	    });
	  }

	  function buildInputObjectDef(inputObjectIntrospection) {
	    if (!inputObjectIntrospection.inputFields) {
	      throw new Error('Introspection result missing inputFields: ' + inspect(inputObjectIntrospection));
	    }

	    return new GraphQLInputObjectType({
	      name: inputObjectIntrospection.name,
	      description: inputObjectIntrospection.description,
	      fields: function fields() {
	        return buildInputValueDefMap(inputObjectIntrospection.inputFields);
	      }
	    });
	  }

	  function buildFieldDefMap(typeIntrospection) {
	    if (!typeIntrospection.fields) {
	      throw new Error('Introspection result missing fields: ' + inspect(typeIntrospection));
	    }

	    return keyValMap(typeIntrospection.fields, function (fieldIntrospection) {
	      return fieldIntrospection.name;
	    }, function (fieldIntrospection) {
	      if (!fieldIntrospection.args) {
	        throw new Error('Introspection result missing field args: ' + inspect(fieldIntrospection));
	      }

	      return {
	        description: fieldIntrospection.description,
	        deprecationReason: fieldIntrospection.deprecationReason,
	        type: getOutputType(fieldIntrospection.type),
	        args: buildInputValueDefMap(fieldIntrospection.args)
	      };
	    });
	  }

	  function buildInputValueDefMap(inputValueIntrospections) {
	    return keyValMap(inputValueIntrospections, function (inputValue) {
	      return inputValue.name;
	    }, buildInputValue);
	  }

	  function buildInputValue(inputValueIntrospection) {
	    var type = getInputType(inputValueIntrospection.type);
	    var defaultValue = inputValueIntrospection.defaultValue ? valueFromAST(parseValue(inputValueIntrospection.defaultValue), type) : undefined;
	    return {
	      description: inputValueIntrospection.description,
	      type: type,
	      defaultValue: defaultValue
	    };
	  }

	  function buildDirective(directiveIntrospection) {
	    if (!directiveIntrospection.args) {
	      throw new Error('Introspection result missing directive args: ' + inspect(directiveIntrospection));
	    }

	    if (!directiveIntrospection.locations) {
	      throw new Error('Introspection result missing directive locations: ' + inspect(directiveIntrospection));
	    }

	    return new GraphQLDirective({
	      name: directiveIntrospection.name,
	      description: directiveIntrospection.description,
	      locations: directiveIntrospection.locations.slice(),
	      args: buildInputValueDefMap(directiveIntrospection.args)
	    });
	  }
	}

	/**
	 * This takes the ast of a schema document produced by the parse function in
	 * src/language/parser.js.
	 *
	 * If no schema definition is provided, then it will look for types named Query
	 * and Mutation.
	 *
	 * Given that AST it constructs a GraphQLSchema. The resulting schema
	 * has no resolve methods, so execution will use default resolvers.
	 *
	 * Accepts options as a second argument:
	 *
	 *    - commentDescriptions:
	 *        Provide true to use preceding comments as the description.
	 *
	 */
	function buildASTSchema(documentAST, options) {
	  documentAST && documentAST.kind === Kind.DOCUMENT || devAssert(0, 'Must provide valid Document AST');

	  if (!options || !(options.assumeValid || options.assumeValidSDL)) {
	    assertValidSDL(documentAST);
	  }

	  var schemaDef;
	  var typeDefs = [];
	  var directiveDefs = [];

	  for (var _i2 = 0, _documentAST$definiti2 = documentAST.definitions; _i2 < _documentAST$definiti2.length; _i2++) {
	    var def = _documentAST$definiti2[_i2];

	    if (def.kind === Kind.SCHEMA_DEFINITION) {
	      schemaDef = def;
	    } else if (isTypeDefinitionNode(def)) {
	      typeDefs.push(def);
	    } else if (def.kind === Kind.DIRECTIVE_DEFINITION) {
	      directiveDefs.push(def);
	    }
	  }

	  var astBuilder = new ASTDefinitionBuilder(options, function (typeName) {
	    var type = typeMap[typeName];

	    if (type === undefined) {
	      throw new Error("Type \"".concat(typeName, "\" not found in document."));
	    }

	    return type;
	  });
	  var typeMap = keyByNameNode(typeDefs, function (node) {
	    return astBuilder.buildType(node);
	  });
	  var operationTypes = schemaDef ? getOperationTypes(schemaDef) : {
	    query: 'Query',
	    mutation: 'Mutation',
	    subscription: 'Subscription'
	  };
	  var directives = directiveDefs.map(function (def) {
	    return astBuilder.buildDirective(def);
	  }); // If specified directives were not explicitly declared, add them.

	  if (!directives.some(function (directive) {
	    return directive.name === 'skip';
	  })) {
	    directives.push(GraphQLSkipDirective);
	  }

	  if (!directives.some(function (directive) {
	    return directive.name === 'include';
	  })) {
	    directives.push(GraphQLIncludeDirective);
	  }

	  if (!directives.some(function (directive) {
	    return directive.name === 'deprecated';
	  })) {
	    directives.push(GraphQLDeprecatedDirective);
	  }

	  return new GraphQLSchema({
	    // Note: While this could make early assertions to get the correctly
	    // typed values below, that would throw immediately while type system
	    // validation with validateSchema() will produce more actionable results.
	    query: operationTypes.query ? typeMap[operationTypes.query] : null,
	    mutation: operationTypes.mutation ? typeMap[operationTypes.mutation] : null,
	    subscription: operationTypes.subscription ? typeMap[operationTypes.subscription] : null,
	    types: objectValues(typeMap),
	    directives: directives,
	    astNode: schemaDef,
	    assumeValid: options && options.assumeValid,
	    allowedLegacyNames: options && options.allowedLegacyNames
	  });

	  function getOperationTypes(schema) {
	    var opTypes = {};

	    for (var _i4 = 0, _schema$operationType2 = schema.operationTypes; _i4 < _schema$operationType2.length; _i4++) {
	      var operationType = _schema$operationType2[_i4];
	      opTypes[operationType.operation] = operationType.type.name.value;
	    }

	    return opTypes;
	  }
	}
	var stdTypeMap = keyMap(specifiedScalarTypes.concat(introspectionTypes), function (type) {
	  return type.name;
	});
	var ASTDefinitionBuilder =
	/*#__PURE__*/
	function () {
	  function ASTDefinitionBuilder(options, resolveType) {
	    this._options = options;
	    this._resolveType = resolveType;
	  }

	  var _proto = ASTDefinitionBuilder.prototype;

	  _proto.getNamedType = function getNamedType(node) {
	    var name = node.name.value;
	    return stdTypeMap[name] || this._resolveType(name);
	  };

	  _proto.getWrappedType = function getWrappedType(node) {
	    if (node.kind === Kind.LIST_TYPE) {
	      return new GraphQLList(this.getWrappedType(node.type));
	    }

	    if (node.kind === Kind.NON_NULL_TYPE) {
	      return new GraphQLNonNull(this.getWrappedType(node.type));
	    }

	    return this.getNamedType(node);
	  };

	  _proto.buildDirective = function buildDirective(directive) {
	    var _this = this;

	    var locations = directive.locations.map(function (_ref) {
	      var value = _ref.value;
	      return value;
	    });
	    return new GraphQLDirective({
	      name: directive.name.value,
	      description: getDescription(directive, this._options),
	      locations: locations,
	      isRepeatable: directive.repeatable,
	      args: keyByNameNode(directive.arguments || [], function (arg) {
	        return _this.buildArg(arg);
	      }),
	      astNode: directive
	    });
	  };

	  _proto.buildField = function buildField(field) {
	    var _this2 = this;

	    return {
	      // Note: While this could make assertions to get the correctly typed
	      // value, that would throw immediately while type system validation
	      // with validateSchema() will produce more actionable results.
	      type: this.getWrappedType(field.type),
	      description: getDescription(field, this._options),
	      args: keyByNameNode(field.arguments || [], function (arg) {
	        return _this2.buildArg(arg);
	      }),
	      deprecationReason: getDeprecationReason(field),
	      astNode: field
	    };
	  };

	  _proto.buildArg = function buildArg(value) {
	    // Note: While this could make assertions to get the correctly typed
	    // value, that would throw immediately while type system validation
	    // with validateSchema() will produce more actionable results.
	    var type = this.getWrappedType(value.type);
	    return {
	      type: type,
	      description: getDescription(value, this._options),
	      defaultValue: valueFromAST(value.defaultValue, type),
	      astNode: value
	    };
	  };

	  _proto.buildInputField = function buildInputField(value) {
	    // Note: While this could make assertions to get the correctly typed
	    // value, that would throw immediately while type system validation
	    // with validateSchema() will produce more actionable results.
	    var type = this.getWrappedType(value.type);
	    return {
	      type: type,
	      description: getDescription(value, this._options),
	      defaultValue: valueFromAST(value.defaultValue, type),
	      astNode: value
	    };
	  };

	  _proto.buildEnumValue = function buildEnumValue(value) {
	    return {
	      description: getDescription(value, this._options),
	      deprecationReason: getDeprecationReason(value),
	      astNode: value
	    };
	  };

	  _proto.buildType = function buildType(astNode) {
	    var name = astNode.name.value;

	    if (stdTypeMap[name]) {
	      return stdTypeMap[name];
	    }

	    switch (astNode.kind) {
	      case Kind.OBJECT_TYPE_DEFINITION:
	        return this._makeTypeDef(astNode);

	      case Kind.INTERFACE_TYPE_DEFINITION:
	        return this._makeInterfaceDef(astNode);

	      case Kind.ENUM_TYPE_DEFINITION:
	        return this._makeEnumDef(astNode);

	      case Kind.UNION_TYPE_DEFINITION:
	        return this._makeUnionDef(astNode);

	      case Kind.SCALAR_TYPE_DEFINITION:
	        return this._makeScalarDef(astNode);

	      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
	        return this._makeInputObjectDef(astNode);
	    } // Not reachable. All possible type definition nodes have been considered.


	    /* istanbul ignore next */
	    invariant(false, 'Unexpected type definition node: ' + inspect(astNode));
	  };

	  _proto._makeTypeDef = function _makeTypeDef(astNode) {
	    var _this3 = this;

	    var interfaceNodes = astNode.interfaces;
	    var fieldNodes = astNode.fields; // Note: While this could make assertions to get the correctly typed
	    // values below, that would throw immediately while type system
	    // validation with validateSchema() will produce more actionable results.

	    var interfaces = interfaceNodes && interfaceNodes.length > 0 ? function () {
	      return interfaceNodes.map(function (ref) {
	        return _this3.getNamedType(ref);
	      });
	    } : [];
	    var fields = fieldNodes && fieldNodes.length > 0 ? function () {
	      return keyByNameNode(fieldNodes, function (field) {
	        return _this3.buildField(field);
	      });
	    } : Object.create(null);
	    return new GraphQLObjectType({
	      name: astNode.name.value,
	      description: getDescription(astNode, this._options),
	      interfaces: interfaces,
	      fields: fields,
	      astNode: astNode
	    });
	  };

	  _proto._makeInterfaceDef = function _makeInterfaceDef(astNode) {
	    var _this4 = this;

	    var fieldNodes = astNode.fields;
	    var fields = fieldNodes && fieldNodes.length > 0 ? function () {
	      return keyByNameNode(fieldNodes, function (field) {
	        return _this4.buildField(field);
	      });
	    } : Object.create(null);
	    return new GraphQLInterfaceType({
	      name: astNode.name.value,
	      description: getDescription(astNode, this._options),
	      fields: fields,
	      astNode: astNode
	    });
	  };

	  _proto._makeEnumDef = function _makeEnumDef(astNode) {
	    var _this5 = this;

	    var valueNodes = astNode.values || [];
	    return new GraphQLEnumType({
	      name: astNode.name.value,
	      description: getDescription(astNode, this._options),
	      values: keyByNameNode(valueNodes, function (value) {
	        return _this5.buildEnumValue(value);
	      }),
	      astNode: astNode
	    });
	  };

	  _proto._makeUnionDef = function _makeUnionDef(astNode) {
	    var _this6 = this;

	    var typeNodes = astNode.types; // Note: While this could make assertions to get the correctly typed
	    // values below, that would throw immediately while type system
	    // validation with validateSchema() will produce more actionable results.

	    var types = typeNodes && typeNodes.length > 0 ? function () {
	      return typeNodes.map(function (ref) {
	        return _this6.getNamedType(ref);
	      });
	    } : [];
	    return new GraphQLUnionType({
	      name: astNode.name.value,
	      description: getDescription(astNode, this._options),
	      types: types,
	      astNode: astNode
	    });
	  };

	  _proto._makeScalarDef = function _makeScalarDef(astNode) {
	    return new GraphQLScalarType({
	      name: astNode.name.value,
	      description: getDescription(astNode, this._options),
	      astNode: astNode
	    });
	  };

	  _proto._makeInputObjectDef = function _makeInputObjectDef(def) {
	    var _this7 = this;

	    var fields = def.fields;
	    return new GraphQLInputObjectType({
	      name: def.name.value,
	      description: getDescription(def, this._options),
	      fields: fields ? function () {
	        return keyByNameNode(fields, function (field) {
	          return _this7.buildInputField(field);
	        });
	      } : Object.create(null),
	      astNode: def
	    });
	  };

	  return ASTDefinitionBuilder;
	}();

	function keyByNameNode(list, valFn) {
	  return keyValMap(list, function (_ref2) {
	    var name = _ref2.name;
	    return name.value;
	  }, valFn);
	}
	/**
	 * Given a field or enum value node, returns the string value for the
	 * deprecation reason.
	 */


	function getDeprecationReason(node) {
	  var deprecated = getDirectiveValues(GraphQLDeprecatedDirective, node);
	  return deprecated && deprecated.reason;
	}
	/**
	 * Given an ast node, returns its string description.
	 * @deprecated: provided to ease adoption and will be removed in v16.
	 *
	 * Accepts options as a second argument:
	 *
	 *    - commentDescriptions:
	 *        Provide true to use preceding comments as the description.
	 *
	 */


	function getDescription(node, options) {
	  if (node.description) {
	    return node.description.value;
	  }

	  if (options && options.commentDescriptions) {
	    var rawValue = getLeadingCommentBlock(node);

	    if (rawValue !== undefined) {
	      return dedentBlockStringValue('\n' + rawValue);
	    }
	  }
	}

	function getLeadingCommentBlock(node) {
	  var loc = node.loc;

	  if (!loc) {
	    return;
	  }

	  var comments = [];
	  var token = loc.startToken.prev;

	  while (token && token.kind === TokenKind.COMMENT && token.next && token.prev && token.line + 1 === token.next.line && token.line !== token.prev.line) {
	    var value = String(token.value);
	    comments.push(value);
	    token = token.prev;
	  }

	  return comments.reverse().join('\n');
	}
	/**
	 * A helper function to build a GraphQLSchema directly from a source
	 * document.
	 */


	function buildSchema(source, options) {
	  return buildASTSchema(parse(source, options), options);
	}

	function ownKeys$4(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

	function _objectSpread$3(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys$4(source, true).forEach(function (key) { _defineProperty$5(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys$4(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

	function _defineProperty$5(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

	/**
	 * Produces a new schema given an existing schema and a document which may
	 * contain GraphQL type extensions and definitions. The original schema will
	 * remain unaltered.
	 *
	 * Because a schema represents a graph of references, a schema cannot be
	 * extended without effectively making an entire copy. We do not know until it's
	 * too late if subgraphs remain unchanged.
	 *
	 * This algorithm copies the provided schema, applying extensions while
	 * producing the copy. The original schema remains unaltered.
	 *
	 * Accepts options as a third argument:
	 *
	 *    - commentDescriptions:
	 *        Provide true to use preceding comments as the description.
	 *
	 */
	function extendSchema(schema, documentAST, options) {
	  assertSchema(schema);
	  documentAST && documentAST.kind === Kind.DOCUMENT || devAssert(0, 'Must provide valid Document AST');

	  if (!options || !(options.assumeValid || options.assumeValidSDL)) {
	    assertValidSDLExtension(documentAST, schema);
	  } // Collect the type definitions and extensions found in the document.


	  var typeDefs = [];
	  var typeExtsMap = Object.create(null); // New directives and types are separate because a directives and types can
	  // have the same name. For example, a type named "skip".

	  var directiveDefs = [];
	  var schemaDef; // Schema extensions are collected which may add additional operation types.

	  var schemaExts = [];

	  for (var _i2 = 0, _documentAST$definiti2 = documentAST.definitions; _i2 < _documentAST$definiti2.length; _i2++) {
	    var def = _documentAST$definiti2[_i2];

	    if (def.kind === Kind.SCHEMA_DEFINITION) {
	      schemaDef = def;
	    } else if (def.kind === Kind.SCHEMA_EXTENSION) {
	      schemaExts.push(def);
	    } else if (isTypeDefinitionNode(def)) {
	      typeDefs.push(def);
	    } else if (isTypeExtensionNode(def)) {
	      var extendedTypeName = def.name.value;
	      var existingTypeExts = typeExtsMap[extendedTypeName];
	      typeExtsMap[extendedTypeName] = existingTypeExts ? existingTypeExts.concat([def]) : [def];
	    } else if (def.kind === Kind.DIRECTIVE_DEFINITION) {
	      directiveDefs.push(def);
	    }
	  } // If this document contains no new types, extensions, or directives then
	  // return the same unmodified GraphQLSchema instance.


	  if (Object.keys(typeExtsMap).length === 0 && typeDefs.length === 0 && directiveDefs.length === 0 && schemaExts.length === 0 && !schemaDef) {
	    return schema;
	  }

	  var schemaConfig = schema.toConfig();
	  var astBuilder = new ASTDefinitionBuilder(options, function (typeName) {
	    var type = typeMap[typeName];

	    if (type === undefined) {
	      throw new Error("Unknown type: \"".concat(typeName, "\"."));
	    }

	    return type;
	  });
	  var typeMap = keyValMap(typeDefs, function (node) {
	    return node.name.value;
	  }, function (node) {
	    return astBuilder.buildType(node);
	  });

	  for (var _i4 = 0, _schemaConfig$types2 = schemaConfig.types; _i4 < _schemaConfig$types2.length; _i4++) {
	    var existingType = _schemaConfig$types2[_i4];
	    typeMap[existingType.name] = extendNamedType(existingType);
	  } // Get the extended root operation types.


	  var operationTypes = {
	    query: schemaConfig.query && schemaConfig.query.name,
	    mutation: schemaConfig.mutation && schemaConfig.mutation.name,
	    subscription: schemaConfig.subscription && schemaConfig.subscription.name
	  };

	  if (schemaDef) {
	    for (var _i6 = 0, _schemaDef$operationT2 = schemaDef.operationTypes; _i6 < _schemaDef$operationT2.length; _i6++) {
	      var _ref2 = _schemaDef$operationT2[_i6];
	      var operation = _ref2.operation;
	      var type = _ref2.type;
	      operationTypes[operation] = type.name.value;
	    }
	  } // Then, incorporate schema definition and all schema extensions.


	  for (var _i8 = 0; _i8 < schemaExts.length; _i8++) {
	    var schemaExt = schemaExts[_i8];

	    if (schemaExt.operationTypes) {
	      for (var _i10 = 0, _schemaExt$operationT2 = schemaExt.operationTypes; _i10 < _schemaExt$operationT2.length; _i10++) {
	        var _ref4 = _schemaExt$operationT2[_i10];
	        var _operation = _ref4.operation;
	        var _type = _ref4.type;
	        operationTypes[_operation] = _type.name.value;
	      }
	    }
	  } // Support both original legacy names and extended legacy names.


	  var allowedLegacyNames = schemaConfig.allowedLegacyNames.concat(options && options.allowedLegacyNames || []); // Then produce and return a Schema with these types.

	  return new GraphQLSchema({
	    // Note: While this could make early assertions to get the correctly
	    // typed values, that would throw immediately while type system
	    // validation with validateSchema() will produce more actionable results.
	    query: getMaybeTypeByName(operationTypes.query),
	    mutation: getMaybeTypeByName(operationTypes.mutation),
	    subscription: getMaybeTypeByName(operationTypes.subscription),
	    types: objectValues(typeMap),
	    directives: getMergedDirectives(),
	    astNode: schemaDef || schemaConfig.astNode,
	    extensionASTNodes: schemaConfig.extensionASTNodes.concat(schemaExts),
	    allowedLegacyNames: allowedLegacyNames
	  }); // Below are functions used for producing this schema that have closed over
	  // this scope and have access to the schema, cache, and newly defined types.

	  function replaceType(type) {
	    if (isListType(type)) {
	      return new GraphQLList(replaceType(type.ofType));
	    } else if (isNonNullType(type)) {
	      return new GraphQLNonNull(replaceType(type.ofType));
	    }

	    return replaceNamedType(type);
	  }

	  function replaceNamedType(type) {
	    return typeMap[type.name];
	  }

	  function getMaybeTypeByName(typeName) {
	    return typeName ? typeMap[typeName] : null;
	  }

	  function getMergedDirectives() {
	    var existingDirectives = schema.getDirectives().map(extendDirective);
	    existingDirectives || devAssert(0, 'schema must have default directives');
	    return existingDirectives.concat(directiveDefs.map(function (node) {
	      return astBuilder.buildDirective(node);
	    }));
	  }

	  function extendNamedType(type) {
	    if (isIntrospectionType(type) || isSpecifiedScalarType(type)) {
	      // Builtin types are not extended.
	      return type;
	    } else if (isScalarType(type)) {
	      return extendScalarType(type);
	    } else if (isObjectType(type)) {
	      return extendObjectType(type);
	    } else if (isInterfaceType(type)) {
	      return extendInterfaceType(type);
	    } else if (isUnionType(type)) {
	      return extendUnionType(type);
	    } else if (isEnumType(type)) {
	      return extendEnumType(type);
	    } else if (isInputObjectType(type)) {
	      return extendInputObjectType(type);
	    } // Not reachable. All possible types have been considered.


	    /* istanbul ignore next */
	    invariant(false, 'Unexpected type: ' + inspect(type));
	  }

	  function extendDirective(directive) {
	    var config = directive.toConfig();
	    return new GraphQLDirective(_objectSpread$3({}, config, {
	      args: mapValue(config.args, extendArg)
	    }));
	  }

	  function extendInputObjectType(type) {
	    var config = type.toConfig();
	    var extensions = typeExtsMap[config.name] || [];
	    var fieldNodes = flatMap$1(extensions, function (node) {
	      return node.fields || [];
	    });
	    return new GraphQLInputObjectType(_objectSpread$3({}, config, {
	      fields: function fields() {
	        return _objectSpread$3({}, mapValue(config.fields, function (field) {
	          return _objectSpread$3({}, field, {
	            type: replaceType(field.type)
	          });
	        }), {}, keyValMap(fieldNodes, function (field) {
	          return field.name.value;
	        }, function (field) {
	          return astBuilder.buildInputField(field);
	        }));
	      },
	      extensionASTNodes: config.extensionASTNodes.concat(extensions)
	    }));
	  }

	  function extendEnumType(type) {
	    var config = type.toConfig();
	    var extensions = typeExtsMap[type.name] || [];
	    var valueNodes = flatMap$1(extensions, function (node) {
	      return node.values || [];
	    });
	    return new GraphQLEnumType(_objectSpread$3({}, config, {
	      values: _objectSpread$3({}, config.values, {}, keyValMap(valueNodes, function (value) {
	        return value.name.value;
	      }, function (value) {
	        return astBuilder.buildEnumValue(value);
	      })),
	      extensionASTNodes: config.extensionASTNodes.concat(extensions)
	    }));
	  }

	  function extendScalarType(type) {
	    var config = type.toConfig();
	    var extensions = typeExtsMap[config.name] || [];
	    return new GraphQLScalarType(_objectSpread$3({}, config, {
	      extensionASTNodes: config.extensionASTNodes.concat(extensions)
	    }));
	  }

	  function extendObjectType(type) {
	    var config = type.toConfig();
	    var extensions = typeExtsMap[config.name] || [];
	    var interfaceNodes = flatMap$1(extensions, function (node) {
	      return node.interfaces || [];
	    });
	    var fieldNodes = flatMap$1(extensions, function (node) {
	      return node.fields || [];
	    });
	    return new GraphQLObjectType(_objectSpread$3({}, config, {
	      interfaces: function interfaces() {
	        return [].concat(type.getInterfaces().map(replaceNamedType), interfaceNodes.map(function (node) {
	          return astBuilder.getNamedType(node);
	        }));
	      },
	      fields: function fields() {
	        return _objectSpread$3({}, mapValue(config.fields, extendField), {}, keyValMap(fieldNodes, function (node) {
	          return node.name.value;
	        }, function (node) {
	          return astBuilder.buildField(node);
	        }));
	      },
	      extensionASTNodes: config.extensionASTNodes.concat(extensions)
	    }));
	  }

	  function extendInterfaceType(type) {
	    var config = type.toConfig();
	    var extensions = typeExtsMap[config.name] || [];
	    var fieldNodes = flatMap$1(extensions, function (node) {
	      return node.fields || [];
	    });
	    return new GraphQLInterfaceType(_objectSpread$3({}, config, {
	      fields: function fields() {
	        return _objectSpread$3({}, mapValue(config.fields, extendField), {}, keyValMap(fieldNodes, function (node) {
	          return node.name.value;
	        }, function (node) {
	          return astBuilder.buildField(node);
	        }));
	      },
	      extensionASTNodes: config.extensionASTNodes.concat(extensions)
	    }));
	  }

	  function extendUnionType(type) {
	    var config = type.toConfig();
	    var extensions = typeExtsMap[config.name] || [];
	    var typeNodes = flatMap$1(extensions, function (node) {
	      return node.types || [];
	    });
	    return new GraphQLUnionType(_objectSpread$3({}, config, {
	      types: function types() {
	        return [].concat(type.getTypes().map(replaceNamedType), typeNodes.map(function (node) {
	          return astBuilder.getNamedType(node);
	        }));
	      },
	      extensionASTNodes: config.extensionASTNodes.concat(extensions)
	    }));
	  }

	  function extendField(field) {
	    return _objectSpread$3({}, field, {
	      type: replaceType(field.type),
	      args: mapValue(field.args, extendArg)
	    });
	  }

	  function extendArg(arg) {
	    return _objectSpread$3({}, arg, {
	      type: replaceType(arg.type)
	    });
	  }
	}

	function ownKeys$5(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

	function _objectSpread$4(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys$5(source, true).forEach(function (key) { _defineProperty$6(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys$5(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

	function _defineProperty$6(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
	/**
	 * Sort GraphQLSchema.
	 */

	function lexicographicSortSchema(schema) {
	  var schemaConfig = schema.toConfig();
	  var typeMap = keyValMap(sortByName(schemaConfig.types), function (type) {
	    return type.name;
	  }, sortNamedType);
	  return new GraphQLSchema(_objectSpread$4({}, schemaConfig, {
	    types: objectValues(typeMap),
	    directives: sortByName(schemaConfig.directives).map(sortDirective),
	    query: replaceMaybeType(schemaConfig.query),
	    mutation: replaceMaybeType(schemaConfig.mutation),
	    subscription: replaceMaybeType(schemaConfig.subscription)
	  }));

	  function replaceType(type) {
	    if (isListType(type)) {
	      return new GraphQLList(replaceType(type.ofType));
	    } else if (isNonNullType(type)) {
	      return new GraphQLNonNull(replaceType(type.ofType));
	    }

	    return replaceNamedType(type);
	  }

	  function replaceNamedType(type) {
	    return typeMap[type.name];
	  }

	  function replaceMaybeType(maybeType) {
	    return maybeType && replaceNamedType(maybeType);
	  }

	  function sortDirective(directive) {
	    var config = directive.toConfig();
	    return new GraphQLDirective(_objectSpread$4({}, config, {
	      locations: sortBy(config.locations, function (x) {
	        return x;
	      }),
	      args: sortArgs(config.args)
	    }));
	  }

	  function sortArgs(args) {
	    return sortObjMap(args, function (arg) {
	      return _objectSpread$4({}, arg, {
	        type: replaceType(arg.type)
	      });
	    });
	  }

	  function sortFields(fieldsMap) {
	    return sortObjMap(fieldsMap, function (field) {
	      return _objectSpread$4({}, field, {
	        type: replaceType(field.type),
	        args: sortArgs(field.args)
	      });
	    });
	  }

	  function sortInputFields(fieldsMap) {
	    return sortObjMap(fieldsMap, function (field) {
	      return _objectSpread$4({}, field, {
	        type: replaceType(field.type)
	      });
	    });
	  }

	  function sortTypes(arr) {
	    return sortByName(arr).map(replaceNamedType);
	  }

	  function sortNamedType(type) {
	    if (isScalarType(type) || isIntrospectionType(type)) {
	      return type;
	    } else if (isObjectType(type)) {
	      var config = type.toConfig();
	      return new GraphQLObjectType(_objectSpread$4({}, config, {
	        interfaces: function interfaces() {
	          return sortTypes(config.interfaces);
	        },
	        fields: function fields() {
	          return sortFields(config.fields);
	        }
	      }));
	    } else if (isInterfaceType(type)) {
	      var _config = type.toConfig();

	      return new GraphQLInterfaceType(_objectSpread$4({}, _config, {
	        fields: function fields() {
	          return sortFields(_config.fields);
	        }
	      }));
	    } else if (isUnionType(type)) {
	      var _config2 = type.toConfig();

	      return new GraphQLUnionType(_objectSpread$4({}, _config2, {
	        types: function types() {
	          return sortTypes(_config2.types);
	        }
	      }));
	    } else if (isEnumType(type)) {
	      var _config3 = type.toConfig();

	      return new GraphQLEnumType(_objectSpread$4({}, _config3, {
	        values: sortObjMap(_config3.values)
	      }));
	    } else if (isInputObjectType(type)) {
	      var _config4 = type.toConfig();

	      return new GraphQLInputObjectType(_objectSpread$4({}, _config4, {
	        fields: function fields() {
	          return sortInputFields(_config4.fields);
	        }
	      }));
	    } // Not reachable. All possible types have been considered.


	    /* istanbul ignore next */
	    invariant(false, 'Unexpected type: ' + inspect(type));
	  }
	}

	function sortObjMap(map, sortValueFn) {
	  var sortedMap = Object.create(null);
	  var sortedKeys = sortBy(Object.keys(map), function (x) {
	    return x;
	  });

	  for (var _i2 = 0; _i2 < sortedKeys.length; _i2++) {
	    var key = sortedKeys[_i2];
	    var value = map[key];
	    sortedMap[key] = sortValueFn ? sortValueFn(value) : value;
	  }

	  return sortedMap;
	}

	function sortByName(array) {
	  return sortBy(array, function (obj) {
	    return obj.name;
	  });
	}

	function sortBy(array, mapToKey) {
	  return array.slice().sort(function (obj1, obj2) {
	    var key1 = mapToKey(obj1);
	    var key2 = mapToKey(obj2);
	    return key1.localeCompare(key2);
	  });
	}

	/**
	 * Accepts options as a second argument:
	 *
	 *    - commentDescriptions:
	 *        Provide true to use preceding comments as the description.
	 *
	 */
	function printSchema(schema, options) {
	  return printFilteredSchema(schema, function (n) {
	    return !isSpecifiedDirective(n);
	  }, isDefinedType, options);
	}
	function printIntrospectionSchema(schema, options) {
	  return printFilteredSchema(schema, isSpecifiedDirective, isIntrospectionType, options);
	}

	function isDefinedType(type) {
	  return !isSpecifiedScalarType(type) && !isIntrospectionType(type);
	}

	function printFilteredSchema(schema, directiveFilter, typeFilter, options) {
	  var directives = schema.getDirectives().filter(directiveFilter);
	  var typeMap = schema.getTypeMap();
	  var types = objectValues(typeMap).sort(function (type1, type2) {
	    return type1.name.localeCompare(type2.name);
	  }).filter(typeFilter);
	  return [printSchemaDefinition(schema)].concat(directives.map(function (directive) {
	    return printDirective(directive, options);
	  }), types.map(function (type) {
	    return printType(type, options);
	  })).filter(Boolean).join('\n\n') + '\n';
	}

	function printSchemaDefinition(schema) {
	  if (isSchemaOfCommonNames(schema)) {
	    return;
	  }

	  var operationTypes = [];
	  var queryType = schema.getQueryType();

	  if (queryType) {
	    operationTypes.push("  query: ".concat(queryType.name));
	  }

	  var mutationType = schema.getMutationType();

	  if (mutationType) {
	    operationTypes.push("  mutation: ".concat(mutationType.name));
	  }

	  var subscriptionType = schema.getSubscriptionType();

	  if (subscriptionType) {
	    operationTypes.push("  subscription: ".concat(subscriptionType.name));
	  }

	  return "schema {\n".concat(operationTypes.join('\n'), "\n}");
	}
	/**
	 * GraphQL schema define root types for each type of operation. These types are
	 * the same as any other type and can be named in any manner, however there is
	 * a common naming convention:
	 *
	 *   schema {
	 *     query: Query
	 *     mutation: Mutation
	 *   }
	 *
	 * When using this naming convention, the schema description can be omitted.
	 */


	function isSchemaOfCommonNames(schema) {
	  var queryType = schema.getQueryType();

	  if (queryType && queryType.name !== 'Query') {
	    return false;
	  }

	  var mutationType = schema.getMutationType();

	  if (mutationType && mutationType.name !== 'Mutation') {
	    return false;
	  }

	  var subscriptionType = schema.getSubscriptionType();

	  if (subscriptionType && subscriptionType.name !== 'Subscription') {
	    return false;
	  }

	  return true;
	}

	function printType(type, options) {
	  if (isScalarType(type)) {
	    return printScalar(type, options);
	  } else if (isObjectType(type)) {
	    return printObject(type, options);
	  } else if (isInterfaceType(type)) {
	    return printInterface(type, options);
	  } else if (isUnionType(type)) {
	    return printUnion(type, options);
	  } else if (isEnumType(type)) {
	    return printEnum(type, options);
	  } else if (isInputObjectType(type)) {
	    return printInputObject(type, options);
	  } // Not reachable. All possible types have been considered.


	  /* istanbul ignore next */
	  invariant(false, 'Unexpected type: ' + inspect(type));
	}

	function printScalar(type, options) {
	  return printDescription(options, type) + "scalar ".concat(type.name);
	}

	function printObject(type, options) {
	  var interfaces = type.getInterfaces();
	  var implementedInterfaces = interfaces.length ? ' implements ' + interfaces.map(function (i) {
	    return i.name;
	  }).join(' & ') : '';
	  return printDescription(options, type) + "type ".concat(type.name).concat(implementedInterfaces) + printFields(options, type);
	}

	function printInterface(type, options) {
	  return printDescription(options, type) + "interface ".concat(type.name) + printFields(options, type);
	}

	function printUnion(type, options) {
	  var types = type.getTypes();
	  var possibleTypes = types.length ? ' = ' + types.join(' | ') : '';
	  return printDescription(options, type) + 'union ' + type.name + possibleTypes;
	}

	function printEnum(type, options) {
	  var values = type.getValues().map(function (value, i) {
	    return printDescription(options, value, '  ', !i) + '  ' + value.name + printDeprecated(value);
	  });
	  return printDescription(options, type) + "enum ".concat(type.name) + printBlock(values);
	}

	function printInputObject(type, options) {
	  var fields = objectValues(type.getFields()).map(function (f, i) {
	    return printDescription(options, f, '  ', !i) + '  ' + printInputValue(f);
	  });
	  return printDescription(options, type) + "input ".concat(type.name) + printBlock(fields);
	}

	function printFields(options, type) {
	  var fields = objectValues(type.getFields()).map(function (f, i) {
	    return printDescription(options, f, '  ', !i) + '  ' + f.name + printArgs(options, f.args, '  ') + ': ' + String(f.type) + printDeprecated(f);
	  });
	  return printBlock(fields);
	}

	function printBlock(items) {
	  return items.length !== 0 ? ' {\n' + items.join('\n') + '\n}' : '';
	}

	function printArgs(options, args) {
	  var indentation = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';

	  if (args.length === 0) {
	    return '';
	  } // If every arg does not have a description, print them on one line.


	  if (args.every(function (arg) {
	    return !arg.description;
	  })) {
	    return '(' + args.map(printInputValue).join(', ') + ')';
	  }

	  return '(\n' + args.map(function (arg, i) {
	    return printDescription(options, arg, '  ' + indentation, !i) + '  ' + indentation + printInputValue(arg);
	  }).join('\n') + '\n' + indentation + ')';
	}

	function printInputValue(arg) {
	  var defaultAST = astFromValue(arg.defaultValue, arg.type);
	  var argDecl = arg.name + ': ' + String(arg.type);

	  if (defaultAST) {
	    argDecl += " = ".concat(print(defaultAST));
	  }

	  return argDecl;
	}

	function printDirective(directive, options) {
	  return printDescription(options, directive) + 'directive @' + directive.name + printArgs(options, directive.args) + (directive.isRepeatable ? ' repeatable' : '') + ' on ' + directive.locations.join(' | ');
	}

	function printDeprecated(fieldOrEnumVal) {
	  if (!fieldOrEnumVal.isDeprecated) {
	    return '';
	  }

	  var reason = fieldOrEnumVal.deprecationReason;
	  var reasonAST = astFromValue(reason, GraphQLString);

	  if (reasonAST && reason !== '' && reason !== DEFAULT_DEPRECATION_REASON) {
	    return ' @deprecated(reason: ' + print(reasonAST) + ')';
	  }

	  return ' @deprecated';
	}

	function printDescription(options, def) {
	  var indentation = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
	  var firstInBlock = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

	  if (!def.description) {
	    return '';
	  }

	  var lines = descriptionLines(def.description, 120 - indentation.length);

	  if (options && options.commentDescriptions) {
	    return printDescriptionWithComments(lines, indentation, firstInBlock);
	  }

	  var text = lines.join('\n');
	  var preferMultipleLines = text.length > 70;
	  var blockString = printBlockString(text, '', preferMultipleLines);
	  var prefix = indentation && !firstInBlock ? '\n' + indentation : indentation;
	  return prefix + blockString.replace(/\n/g, '\n' + indentation) + '\n';
	}

	function printDescriptionWithComments(lines, indentation, firstInBlock) {
	  var description = indentation && !firstInBlock ? '\n' : '';

	  for (var _i2 = 0; _i2 < lines.length; _i2++) {
	    var line = lines[_i2];

	    if (line === '') {
	      description += indentation + '#\n';
	    } else {
	      description += indentation + '# ' + line + '\n';
	    }
	  }

	  return description;
	}

	function descriptionLines(description, maxLen) {
	  var rawLines = description.split('\n');
	  return flatMap$1(rawLines, function (line) {
	    if (line.length < maxLen + 5) {
	      return line;
	    } // For > 120 character long lines, cut at space boundaries into sublines
	    // of ~80 chars.


	    return breakLine(line, maxLen);
	  });
	}

	function breakLine(line, maxLen) {
	  var parts = line.split(new RegExp("((?: |^).{15,".concat(maxLen - 40, "}(?= |$))")));

	  if (parts.length < 4) {
	    return [line];
	  }

	  var sublines = [parts[0] + parts[1] + parts[2]];

	  for (var i = 3; i < parts.length; i += 2) {
	    sublines.push(parts[i].slice(1) + parts[i + 1]);
	  }

	  return sublines;
	}

	/* istanbul ignore file */

	/**
	 * Deprecated. Use coerceInputValue() directly for richer information.
	 *
	 * This function will be removed in v15
	 */
	function coerceValue(inputValue, type, blameNode, path) {
	  var errors = [];
	  var value = coerceInputValue(inputValue, type, function (errorPath, invalidValue, error) {
	    var errorPrefix = 'Invalid value ' + inspect(invalidValue);
	    var pathArray = [].concat(pathToArray(path), errorPath);

	    if (pathArray.length > 0) {
	      errorPrefix += " at \"value".concat(printPathArray(pathArray), "\"");
	    }

	    errors.push(new GraphQLError(errorPrefix + ': ' + error.message, blameNode, undefined, undefined, undefined, error.originalError));
	  });
	  return errors.length > 0 ? {
	    errors: errors,
	    value: undefined
	  } : {
	    errors: undefined,
	    value: value
	  };
	}

	/* istanbul ignore file */
	/**
	 * Deprecated. Use coerceInputValue() directly for richer information.
	 *
	 * This function will be removed in v15
	 */

	function isValidJSValue(value, type) {
	  var errors = coerceValue(value, type).errors;
	  return errors ? errors.map(function (error) {
	    return error.message;
	  }) : [];
	}

	/**
	 * Utility which determines if a value literal node is valid for an input type.
	 *
	 * Deprecated. Rely on validation for documents containing literal values.
	 *
	 * This function will be removed in v15
	 */

	function isValidLiteralValue(type, valueNode) {
	  var emptySchema = new GraphQLSchema({});
	  var emptyDoc = {
	    kind: Kind.DOCUMENT,
	    definitions: []
	  };
	  var typeInfo = new TypeInfo(emptySchema, undefined, type);
	  var context = new ValidationContext(emptySchema, emptyDoc, typeInfo);
	  var visitor = ValuesOfCorrectType(context);
	  visit(valueNode, visitWithTypeInfo(typeInfo, visitor));
	  return context.getErrors();
	}

	/**
	 * Provided a collection of ASTs, presumably each from different files,
	 * concatenate the ASTs together into batched AST, useful for validating many
	 * GraphQL source files which together represent one conceptual application.
	 */
	function concatAST(asts) {
	  return {
	    kind: 'Document',
	    definitions: flatMap$1(asts, function (ast) {
	      return ast.definitions;
	    })
	  };
	}

	/**
	 * separateOperations accepts a single AST document which may contain many
	 * operations and fragments and returns a collection of AST documents each of
	 * which contains a single operation as well the fragment definitions it
	 * refers to.
	 */
	function separateOperations(documentAST) {
	  var operations = [];
	  var fragments = Object.create(null);
	  var positions = new Map();
	  var depGraph = Object.create(null);
	  var fromName;
	  var idx = 0; // Populate metadata and build a dependency graph.

	  visit(documentAST, {
	    OperationDefinition: function OperationDefinition(node) {
	      fromName = opName(node);
	      operations.push(node);
	      positions.set(node, idx++);
	    },
	    FragmentDefinition: function FragmentDefinition(node) {
	      fromName = node.name.value;
	      fragments[fromName] = node;
	      positions.set(node, idx++);
	    },
	    FragmentSpread: function FragmentSpread(node) {
	      var toName = node.name.value;
	      (depGraph[fromName] || (depGraph[fromName] = Object.create(null)))[toName] = true;
	    }
	  }); // For each operation, produce a new synthesized AST which includes only what
	  // is necessary for completing that operation.

	  var separatedDocumentASTs = Object.create(null);

	  for (var _i2 = 0; _i2 < operations.length; _i2++) {
	    var operation = operations[_i2];
	    var operationName = opName(operation);
	    var dependencies = Object.create(null);
	    collectTransitiveDependencies(dependencies, depGraph, operationName); // The list of definition nodes to be included for this operation, sorted
	    // to retain the same order as the original document.

	    var definitions = [operation];

	    for (var _i4 = 0, _Object$keys2 = Object.keys(dependencies); _i4 < _Object$keys2.length; _i4++) {
	      var name = _Object$keys2[_i4];
	      definitions.push(fragments[name]);
	    }

	    definitions.sort(function (n1, n2) {
	      return (positions.get(n1) || 0) - (positions.get(n2) || 0);
	    });
	    separatedDocumentASTs[operationName] = {
	      kind: 'Document',
	      definitions: definitions
	    };
	  }

	  return separatedDocumentASTs;
	}

	// Provides the empty string for anonymous operations.
	function opName(operation) {
	  return operation.name ? operation.name.value : '';
	} // From a dependency graph, collects a list of transitive dependencies by
	// recursing through a dependency graph.


	function collectTransitiveDependencies(collected, depGraph, fromName) {
	  var immediateDeps = depGraph[fromName];

	  if (immediateDeps) {
	    for (var _i6 = 0, _Object$keys4 = Object.keys(immediateDeps); _i6 < _Object$keys4.length; _i6++) {
	      var toName = _Object$keys4[_i6];

	      if (!collected[toName]) {
	        collected[toName] = true;
	        collectTransitiveDependencies(collected, depGraph, toName);
	      }
	    }
	  }
	}

	/**
	 * Strips characters that are not significant to the validity or execution
	 * of a GraphQL document:
	 *   - UnicodeBOM
	 *   - WhiteSpace
	 *   - LineTerminator
	 *   - Comment
	 *   - Comma
	 *   - BlockString indentation
	 *
	 * Note: It is required to have a delimiter character between neighboring
	 * non-punctuator tokens and this function always uses single space as delimiter.
	 *
	 * It is guaranteed that both input and output documents if parsed would result
	 * in the exact same AST except for nodes location.
	 *
	 * Warning: It is guaranteed that this function will always produce stable results.
	 * However, it's not guaranteed that it will stay the same between different
	 * releases due to bugfixes or changes in the GraphQL specification.
	 *
	 * Query example:
	 *
	 * query SomeQuery($foo: String!, $bar: String) {
	 *   someField(foo: $foo, bar: $bar) {
	 *     a
	 *     b {
	 *       c
	 *       d
	 *     }
	 *   }
	 * }
	 *
	 * Becomes:
	 *
	 * query SomeQuery($foo:String!$bar:String){someField(foo:$foo bar:$bar){a b{c d}}}
	 *
	 * SDL example:
	 *
	 * """
	 * Type description
	 * """
	 * type Foo {
	 *   """
	 *   Field description
	 *   """
	 *   bar: String
	 * }
	 *
	 * Becomes:
	 *
	 * """Type description""" type Foo{"""Field description""" bar:String}
	 */

	function stripIgnoredCharacters(source) {
	  var sourceObj = typeof source === 'string' ? new Source(source) : source;

	  if (!(sourceObj instanceof Source)) {
	    throw new TypeError("Must provide string or Source. Received: ".concat(inspect(sourceObj)));
	  }

	  var body = sourceObj.body;
	  var lexer = createLexer(sourceObj);
	  var strippedBody = '';
	  var wasLastAddedTokenNonPunctuator = false;

	  while (lexer.advance().kind !== TokenKind.EOF) {
	    var currentToken = lexer.token;
	    var tokenKind = currentToken.kind;
	    /**
	     * Every two non-punctuator tokens should have space between them.
	     * Also prevent case of non-punctuator token following by spread resulting
	     * in invalid token (e.g. `1...` is invalid Float token).
	     */

	    var isNonPunctuator = !isPunctuatorToken(currentToken);

	    if (wasLastAddedTokenNonPunctuator) {
	      if (isNonPunctuator || currentToken.kind === TokenKind.SPREAD) {
	        strippedBody += ' ';
	      }
	    }

	    var tokenBody = body.slice(currentToken.start, currentToken.end);

	    if (tokenKind === TokenKind.BLOCK_STRING) {
	      strippedBody += dedentBlockString(tokenBody);
	    } else {
	      strippedBody += tokenBody;
	    }

	    wasLastAddedTokenNonPunctuator = isNonPunctuator;
	  }

	  return strippedBody;
	}

	function dedentBlockString(blockStr) {
	  // skip leading and trailing triple quotations
	  var rawStr = blockStr.slice(3, -3);
	  var body = dedentBlockStringValue(rawStr);
	  var lines = body.split(/\r\n|[\n\r]/g);

	  if (getBlockStringIndentation(lines) > 0) {
	    body = '\n' + body;
	  }

	  var lastChar = body[body.length - 1];
	  var hasTrailingQuote = lastChar === '"' && body.slice(-4) !== '\\"""';

	  if (hasTrailingQuote || lastChar === '\\') {
	    body += '\n';
	  }

	  return '"""' + body + '"""';
	}

	function ownKeys$6(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

	function _objectSpread$5(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys$6(source, true).forEach(function (key) { _defineProperty$7(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys$6(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

	function _defineProperty$7(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
	var BreakingChangeType = Object.freeze({
	  TYPE_REMOVED: 'TYPE_REMOVED',
	  TYPE_CHANGED_KIND: 'TYPE_CHANGED_KIND',
	  TYPE_REMOVED_FROM_UNION: 'TYPE_REMOVED_FROM_UNION',
	  VALUE_REMOVED_FROM_ENUM: 'VALUE_REMOVED_FROM_ENUM',
	  REQUIRED_INPUT_FIELD_ADDED: 'REQUIRED_INPUT_FIELD_ADDED',
	  INTERFACE_REMOVED_FROM_OBJECT: 'INTERFACE_REMOVED_FROM_OBJECT',
	  FIELD_REMOVED: 'FIELD_REMOVED',
	  FIELD_CHANGED_KIND: 'FIELD_CHANGED_KIND',
	  REQUIRED_ARG_ADDED: 'REQUIRED_ARG_ADDED',
	  ARG_REMOVED: 'ARG_REMOVED',
	  ARG_CHANGED_KIND: 'ARG_CHANGED_KIND',
	  DIRECTIVE_REMOVED: 'DIRECTIVE_REMOVED',
	  DIRECTIVE_ARG_REMOVED: 'DIRECTIVE_ARG_REMOVED',
	  REQUIRED_DIRECTIVE_ARG_ADDED: 'REQUIRED_DIRECTIVE_ARG_ADDED',
	  DIRECTIVE_LOCATION_REMOVED: 'DIRECTIVE_LOCATION_REMOVED'
	});
	var DangerousChangeType = Object.freeze({
	  VALUE_ADDED_TO_ENUM: 'VALUE_ADDED_TO_ENUM',
	  TYPE_ADDED_TO_UNION: 'TYPE_ADDED_TO_UNION',
	  OPTIONAL_INPUT_FIELD_ADDED: 'OPTIONAL_INPUT_FIELD_ADDED',
	  OPTIONAL_ARG_ADDED: 'OPTIONAL_ARG_ADDED',
	  INTERFACE_ADDED_TO_OBJECT: 'INTERFACE_ADDED_TO_OBJECT',
	  ARG_DEFAULT_VALUE_CHANGE: 'ARG_DEFAULT_VALUE_CHANGE'
	});

	/**
	 * Given two schemas, returns an Array containing descriptions of all the types
	 * of breaking changes covered by the other functions down below.
	 */
	function findBreakingChanges(oldSchema, newSchema) {
	  var breakingChanges = findSchemaChanges(oldSchema, newSchema).filter(function (change) {
	    return change.type in BreakingChangeType;
	  });
	  return breakingChanges;
	}
	/**
	 * Given two schemas, returns an Array containing descriptions of all the types
	 * of potentially dangerous changes covered by the other functions down below.
	 */

	function findDangerousChanges(oldSchema, newSchema) {
	  var dangerousChanges = findSchemaChanges(oldSchema, newSchema).filter(function (change) {
	    return change.type in DangerousChangeType;
	  });
	  return dangerousChanges;
	}

	function findSchemaChanges(oldSchema, newSchema) {
	  return [].concat(findTypeChanges(oldSchema, newSchema), findDirectiveChanges(oldSchema, newSchema));
	}

	function findDirectiveChanges(oldSchema, newSchema) {
	  var schemaChanges = [];
	  var directivesDiff = diff(oldSchema.getDirectives(), newSchema.getDirectives());

	  for (var _i2 = 0, _directivesDiff$remov2 = directivesDiff.removed; _i2 < _directivesDiff$remov2.length; _i2++) {
	    var oldDirective = _directivesDiff$remov2[_i2];
	    schemaChanges.push({
	      type: BreakingChangeType.DIRECTIVE_REMOVED,
	      description: "".concat(oldDirective.name, " was removed.")
	    });
	  }

	  for (var _i4 = 0, _directivesDiff$persi2 = directivesDiff.persisted; _i4 < _directivesDiff$persi2.length; _i4++) {
	    var _ref2 = _directivesDiff$persi2[_i4];
	    var _oldDirective = _ref2[0];
	    var newDirective = _ref2[1];
	    var argsDiff = diff(_oldDirective.args, newDirective.args);

	    for (var _i6 = 0, _argsDiff$added2 = argsDiff.added; _i6 < _argsDiff$added2.length; _i6++) {
	      var newArg = _argsDiff$added2[_i6];

	      if (isRequiredArgument(newArg)) {
	        schemaChanges.push({
	          type: BreakingChangeType.REQUIRED_DIRECTIVE_ARG_ADDED,
	          description: "A required arg ".concat(newArg.name, " on directive ").concat(_oldDirective.name, " was added.")
	        });
	      }
	    }

	    for (var _i8 = 0, _argsDiff$removed2 = argsDiff.removed; _i8 < _argsDiff$removed2.length; _i8++) {
	      var oldArg = _argsDiff$removed2[_i8];
	      schemaChanges.push({
	        type: BreakingChangeType.DIRECTIVE_ARG_REMOVED,
	        description: "".concat(oldArg.name, " was removed from ").concat(_oldDirective.name, ".")
	      });
	    }

	    for (var _i10 = 0, _oldDirective$locatio2 = _oldDirective.locations; _i10 < _oldDirective$locatio2.length; _i10++) {
	      var location = _oldDirective$locatio2[_i10];

	      if (newDirective.locations.indexOf(location) === -1) {
	        schemaChanges.push({
	          type: BreakingChangeType.DIRECTIVE_LOCATION_REMOVED,
	          description: "".concat(location, " was removed from ").concat(_oldDirective.name, ".")
	        });
	      }
	    }
	  }

	  return schemaChanges;
	}

	function findTypeChanges(oldSchema, newSchema) {
	  var schemaChanges = [];
	  var typesDiff = diff(objectValues(oldSchema.getTypeMap()), objectValues(newSchema.getTypeMap()));

	  for (var _i12 = 0, _typesDiff$removed2 = typesDiff.removed; _i12 < _typesDiff$removed2.length; _i12++) {
	    var oldType = _typesDiff$removed2[_i12];
	    schemaChanges.push({
	      type: BreakingChangeType.TYPE_REMOVED,
	      description: "".concat(oldType.name, " was removed.")
	    });
	  }

	  for (var _i14 = 0, _typesDiff$persisted2 = typesDiff.persisted; _i14 < _typesDiff$persisted2.length; _i14++) {
	    var _ref4 = _typesDiff$persisted2[_i14];
	    var _oldType = _ref4[0];
	    var newType = _ref4[1];

	    if (isEnumType(_oldType) && isEnumType(newType)) {
	      schemaChanges.push.apply(schemaChanges, findEnumTypeChanges(_oldType, newType));
	    } else if (isUnionType(_oldType) && isUnionType(newType)) {
	      schemaChanges.push.apply(schemaChanges, findUnionTypeChanges(_oldType, newType));
	    } else if (isInputObjectType(_oldType) && isInputObjectType(newType)) {
	      schemaChanges.push.apply(schemaChanges, findInputObjectTypeChanges(_oldType, newType));
	    } else if (isObjectType(_oldType) && isObjectType(newType)) {
	      schemaChanges.push.apply(schemaChanges, findObjectTypeChanges(_oldType, newType));
	    } else if (isInterfaceType(_oldType) && isInterfaceType(newType)) {
	      schemaChanges.push.apply(schemaChanges, findFieldChanges(_oldType, newType));
	    } else if (_oldType.constructor !== newType.constructor) {
	      schemaChanges.push({
	        type: BreakingChangeType.TYPE_CHANGED_KIND,
	        description: "".concat(_oldType.name, " changed from ") + "".concat(typeKindName(_oldType), " to ").concat(typeKindName(newType), ".")
	      });
	    }
	  }

	  return schemaChanges;
	}

	function findInputObjectTypeChanges(oldType, newType) {
	  var schemaChanges = [];
	  var fieldsDiff = diff(objectValues(oldType.getFields()), objectValues(newType.getFields()));

	  for (var _i16 = 0, _fieldsDiff$added2 = fieldsDiff.added; _i16 < _fieldsDiff$added2.length; _i16++) {
	    var newField = _fieldsDiff$added2[_i16];

	    if (isRequiredInputField(newField)) {
	      schemaChanges.push({
	        type: BreakingChangeType.REQUIRED_INPUT_FIELD_ADDED,
	        description: "A required field ".concat(newField.name, " on input type ").concat(oldType.name, " was added.")
	      });
	    } else {
	      schemaChanges.push({
	        type: DangerousChangeType.OPTIONAL_INPUT_FIELD_ADDED,
	        description: "An optional field ".concat(newField.name, " on input type ").concat(oldType.name, " was added.")
	      });
	    }
	  }

	  for (var _i18 = 0, _fieldsDiff$removed2 = fieldsDiff.removed; _i18 < _fieldsDiff$removed2.length; _i18++) {
	    var oldField = _fieldsDiff$removed2[_i18];
	    schemaChanges.push({
	      type: BreakingChangeType.FIELD_REMOVED,
	      description: "".concat(oldType.name, ".").concat(oldField.name, " was removed.")
	    });
	  }

	  for (var _i20 = 0, _fieldsDiff$persisted2 = fieldsDiff.persisted; _i20 < _fieldsDiff$persisted2.length; _i20++) {
	    var _ref6 = _fieldsDiff$persisted2[_i20];
	    var _oldField = _ref6[0];
	    var _newField = _ref6[1];
	    var isSafe = isChangeSafeForInputObjectFieldOrFieldArg(_oldField.type, _newField.type);

	    if (!isSafe) {
	      schemaChanges.push({
	        type: BreakingChangeType.FIELD_CHANGED_KIND,
	        description: "".concat(oldType.name, ".").concat(_oldField.name, " changed type from ") + "".concat(String(_oldField.type), " to ").concat(String(_newField.type), ".")
	      });
	    }
	  }

	  return schemaChanges;
	}

	function findUnionTypeChanges(oldType, newType) {
	  var schemaChanges = [];
	  var possibleTypesDiff = diff(oldType.getTypes(), newType.getTypes());

	  for (var _i22 = 0, _possibleTypesDiff$ad2 = possibleTypesDiff.added; _i22 < _possibleTypesDiff$ad2.length; _i22++) {
	    var newPossibleType = _possibleTypesDiff$ad2[_i22];
	    schemaChanges.push({
	      type: DangerousChangeType.TYPE_ADDED_TO_UNION,
	      description: "".concat(newPossibleType.name, " was added to union type ").concat(oldType.name, ".")
	    });
	  }

	  for (var _i24 = 0, _possibleTypesDiff$re2 = possibleTypesDiff.removed; _i24 < _possibleTypesDiff$re2.length; _i24++) {
	    var oldPossibleType = _possibleTypesDiff$re2[_i24];
	    schemaChanges.push({
	      type: BreakingChangeType.TYPE_REMOVED_FROM_UNION,
	      description: "".concat(oldPossibleType.name, " was removed from union type ").concat(oldType.name, ".")
	    });
	  }

	  return schemaChanges;
	}

	function findEnumTypeChanges(oldType, newType) {
	  var schemaChanges = [];
	  var valuesDiff = diff(oldType.getValues(), newType.getValues());

	  for (var _i26 = 0, _valuesDiff$added2 = valuesDiff.added; _i26 < _valuesDiff$added2.length; _i26++) {
	    var newValue = _valuesDiff$added2[_i26];
	    schemaChanges.push({
	      type: DangerousChangeType.VALUE_ADDED_TO_ENUM,
	      description: "".concat(newValue.name, " was added to enum type ").concat(oldType.name, ".")
	    });
	  }

	  for (var _i28 = 0, _valuesDiff$removed2 = valuesDiff.removed; _i28 < _valuesDiff$removed2.length; _i28++) {
	    var oldValue = _valuesDiff$removed2[_i28];
	    schemaChanges.push({
	      type: BreakingChangeType.VALUE_REMOVED_FROM_ENUM,
	      description: "".concat(oldValue.name, " was removed from enum type ").concat(oldType.name, ".")
	    });
	  }

	  return schemaChanges;
	}

	function findObjectTypeChanges(oldType, newType) {
	  var schemaChanges = findFieldChanges(oldType, newType);
	  var interfacesDiff = diff(oldType.getInterfaces(), newType.getInterfaces());

	  for (var _i30 = 0, _interfacesDiff$added2 = interfacesDiff.added; _i30 < _interfacesDiff$added2.length; _i30++) {
	    var newInterface = _interfacesDiff$added2[_i30];
	    schemaChanges.push({
	      type: DangerousChangeType.INTERFACE_ADDED_TO_OBJECT,
	      description: "".concat(newInterface.name, " added to interfaces implemented by ").concat(oldType.name, ".")
	    });
	  }

	  for (var _i32 = 0, _interfacesDiff$remov2 = interfacesDiff.removed; _i32 < _interfacesDiff$remov2.length; _i32++) {
	    var oldInterface = _interfacesDiff$remov2[_i32];
	    schemaChanges.push({
	      type: BreakingChangeType.INTERFACE_REMOVED_FROM_OBJECT,
	      description: "".concat(oldType.name, " no longer implements interface ").concat(oldInterface.name, ".")
	    });
	  }

	  return schemaChanges;
	}

	function findFieldChanges(oldType, newType) {
	  var schemaChanges = [];
	  var fieldsDiff = diff(objectValues(oldType.getFields()), objectValues(newType.getFields()));

	  for (var _i34 = 0, _fieldsDiff$removed4 = fieldsDiff.removed; _i34 < _fieldsDiff$removed4.length; _i34++) {
	    var oldField = _fieldsDiff$removed4[_i34];
	    schemaChanges.push({
	      type: BreakingChangeType.FIELD_REMOVED,
	      description: "".concat(oldType.name, ".").concat(oldField.name, " was removed.")
	    });
	  }

	  for (var _i36 = 0, _fieldsDiff$persisted4 = fieldsDiff.persisted; _i36 < _fieldsDiff$persisted4.length; _i36++) {
	    var _ref8 = _fieldsDiff$persisted4[_i36];
	    var _oldField2 = _ref8[0];
	    var newField = _ref8[1];
	    schemaChanges.push.apply(schemaChanges, findArgChanges(oldType, _oldField2, newField));
	    var isSafe = isChangeSafeForObjectOrInterfaceField(_oldField2.type, newField.type);

	    if (!isSafe) {
	      schemaChanges.push({
	        type: BreakingChangeType.FIELD_CHANGED_KIND,
	        description: "".concat(oldType.name, ".").concat(_oldField2.name, " changed type from ") + "".concat(String(_oldField2.type), " to ").concat(String(newField.type), ".")
	      });
	    }
	  }

	  return schemaChanges;
	}

	function findArgChanges(oldType, oldField, newField) {
	  var schemaChanges = [];
	  var argsDiff = diff(oldField.args, newField.args);

	  for (var _i38 = 0, _argsDiff$removed4 = argsDiff.removed; _i38 < _argsDiff$removed4.length; _i38++) {
	    var oldArg = _argsDiff$removed4[_i38];
	    schemaChanges.push({
	      type: BreakingChangeType.ARG_REMOVED,
	      description: "".concat(oldType.name, ".").concat(oldField.name, " arg ").concat(oldArg.name, " was removed.")
	    });
	  }

	  for (var _i40 = 0, _argsDiff$persisted2 = argsDiff.persisted; _i40 < _argsDiff$persisted2.length; _i40++) {
	    var _ref10 = _argsDiff$persisted2[_i40];
	    var _oldArg = _ref10[0];
	    var newArg = _ref10[1];
	    var isSafe = isChangeSafeForInputObjectFieldOrFieldArg(_oldArg.type, newArg.type);

	    if (!isSafe) {
	      schemaChanges.push({
	        type: BreakingChangeType.ARG_CHANGED_KIND,
	        description: "".concat(oldType.name, ".").concat(oldField.name, " arg ").concat(_oldArg.name, " has changed type from ") + "".concat(String(_oldArg.type), " to ").concat(String(newArg.type), ".")
	      });
	    } else if (_oldArg.defaultValue !== undefined) {
	      if (newArg.defaultValue === undefined) {
	        schemaChanges.push({
	          type: DangerousChangeType.ARG_DEFAULT_VALUE_CHANGE,
	          description: "".concat(oldType.name, ".").concat(oldField.name, " arg ").concat(_oldArg.name, " defaultValue was removed.")
	        });
	      } else {
	        // Since we looking only for client's observable changes we should
	        // compare default values in the same representation as they are
	        // represented inside introspection.
	        var oldValueStr = stringifyValue(_oldArg.defaultValue, _oldArg.type);
	        var newValueStr = stringifyValue(newArg.defaultValue, newArg.type);

	        if (oldValueStr !== newValueStr) {
	          schemaChanges.push({
	            type: DangerousChangeType.ARG_DEFAULT_VALUE_CHANGE,
	            description: "".concat(oldType.name, ".").concat(oldField.name, " arg ").concat(_oldArg.name, " has changed defaultValue from ").concat(oldValueStr, " to ").concat(newValueStr, ".")
	          });
	        }
	      }
	    }
	  }

	  for (var _i42 = 0, _argsDiff$added4 = argsDiff.added; _i42 < _argsDiff$added4.length; _i42++) {
	    var _newArg = _argsDiff$added4[_i42];

	    if (isRequiredArgument(_newArg)) {
	      schemaChanges.push({
	        type: BreakingChangeType.REQUIRED_ARG_ADDED,
	        description: "A required arg ".concat(_newArg.name, " on ").concat(oldType.name, ".").concat(oldField.name, " was added.")
	      });
	    } else {
	      schemaChanges.push({
	        type: DangerousChangeType.OPTIONAL_ARG_ADDED,
	        description: "An optional arg ".concat(_newArg.name, " on ").concat(oldType.name, ".").concat(oldField.name, " was added.")
	      });
	    }
	  }

	  return schemaChanges;
	}

	function isChangeSafeForObjectOrInterfaceField(oldType, newType) {
	  if (isListType(oldType)) {
	    return (// if they're both lists, make sure the underlying types are compatible
	      isListType(newType) && isChangeSafeForObjectOrInterfaceField(oldType.ofType, newType.ofType) || // moving from nullable to non-null of the same underlying type is safe
	      isNonNullType(newType) && isChangeSafeForObjectOrInterfaceField(oldType, newType.ofType)
	    );
	  }

	  if (isNonNullType(oldType)) {
	    // if they're both non-null, make sure the underlying types are compatible
	    return isNonNullType(newType) && isChangeSafeForObjectOrInterfaceField(oldType.ofType, newType.ofType);
	  }

	  return (// if they're both named types, see if their names are equivalent
	    isNamedType(newType) && oldType.name === newType.name || // moving from nullable to non-null of the same underlying type is safe
	    isNonNullType(newType) && isChangeSafeForObjectOrInterfaceField(oldType, newType.ofType)
	  );
	}

	function isChangeSafeForInputObjectFieldOrFieldArg(oldType, newType) {
	  if (isListType(oldType)) {
	    // if they're both lists, make sure the underlying types are compatible
	    return isListType(newType) && isChangeSafeForInputObjectFieldOrFieldArg(oldType.ofType, newType.ofType);
	  }

	  if (isNonNullType(oldType)) {
	    return (// if they're both non-null, make sure the underlying types are
	      // compatible
	      isNonNullType(newType) && isChangeSafeForInputObjectFieldOrFieldArg(oldType.ofType, newType.ofType) || // moving from non-null to nullable of the same underlying type is safe
	      !isNonNullType(newType) && isChangeSafeForInputObjectFieldOrFieldArg(oldType.ofType, newType)
	    );
	  } // if they're both named types, see if their names are equivalent


	  return isNamedType(newType) && oldType.name === newType.name;
	}

	function typeKindName(type) {
	  if (isScalarType(type)) {
	    return 'a Scalar type';
	  }

	  if (isObjectType(type)) {
	    return 'an Object type';
	  }

	  if (isInterfaceType(type)) {
	    return 'an Interface type';
	  }

	  if (isUnionType(type)) {
	    return 'a Union type';
	  }

	  if (isEnumType(type)) {
	    return 'an Enum type';
	  }

	  /* istanbul ignore else */
	  if (isInputObjectType(type)) {
	    return 'an Input type';
	  } // Not reachable. All possible named types have been considered.


	  /* istanbul ignore next */
	  invariant(false, 'Unexpected type: ' + inspect(type));
	}

	function stringifyValue(value, type) {
	  var ast = astFromValue(value, type);

	  /* istanbul ignore next */
	  ast != null || invariant(0);
	  var sortedAST = visit(ast, {
	    ObjectValue: function ObjectValue(objectNode) {
	      var fields = [].concat(objectNode.fields).sort(function (fieldA, fieldB) {
	        return fieldA.name.value.localeCompare(fieldB.name.value);
	      });
	      return _objectSpread$5({}, objectNode, {
	        fields: fields
	      });
	    }
	  });
	  return print(sortedAST);
	}

	function diff(oldArray, newArray) {
	  var added = [];
	  var removed = [];
	  var persisted = [];
	  var oldMap = keyMap(oldArray, function (_ref11) {
	    var name = _ref11.name;
	    return name;
	  });
	  var newMap = keyMap(newArray, function (_ref12) {
	    var name = _ref12.name;
	    return name;
	  });

	  for (var _i44 = 0; _i44 < oldArray.length; _i44++) {
	    var oldItem = oldArray[_i44];
	    var newItem = newMap[oldItem.name];

	    if (newItem === undefined) {
	      removed.push(oldItem);
	    } else {
	      persisted.push([oldItem, newItem]);
	    }
	  }

	  for (var _i46 = 0; _i46 < newArray.length; _i46++) {
	    var _newItem = newArray[_i46];

	    if (oldMap[_newItem.name] === undefined) {
	      added.push(_newItem);
	    }
	  }

	  return {
	    added: added,
	    persisted: persisted,
	    removed: removed
	  };
	}

	/**
	 * A validation rule which reports deprecated usages.
	 *
	 * Returns a list of GraphQLError instances describing each deprecated use.
	 */

	function findDeprecatedUsages(schema, ast) {
	  var errors = [];
	  var typeInfo = new TypeInfo(schema);
	  visit(ast, visitWithTypeInfo(typeInfo, {
	    Field: function Field(node) {
	      var fieldDef = typeInfo.getFieldDef();

	      if (fieldDef && fieldDef.isDeprecated) {
	        var parentType = typeInfo.getParentType();

	        if (parentType) {
	          var reason = fieldDef.deprecationReason;
	          errors.push(new GraphQLError("The field ".concat(parentType.name, ".").concat(fieldDef.name, " is deprecated.") + (reason ? ' ' + reason : ''), node));
	        }
	      }
	    },
	    EnumValue: function EnumValue(node) {
	      var enumVal = typeInfo.getEnumValue();

	      if (enumVal && enumVal.isDeprecated) {
	        var type = getNamedType(typeInfo.getInputType());

	        if (type) {
	          var reason = enumVal.deprecationReason;
	          errors.push(new GraphQLError("The enum value ".concat(type.name, ".").concat(enumVal.name, " is deprecated.") + (reason ? ' ' + reason : ''), node));
	        }
	      }
	    }
	  }));
	  return errors;
	}

	// The GraphQL query recommended for a full schema introspection.

	var utilities = /*#__PURE__*/Object.freeze({
		__proto__: null,
		getIntrospectionQuery: getIntrospectionQuery,
		introspectionQuery: introspectionQuery,
		getOperationAST: getOperationAST,
		getOperationRootType: getOperationRootType,
		introspectionFromSchema: introspectionFromSchema,
		buildClientSchema: buildClientSchema,
		buildASTSchema: buildASTSchema,
		buildSchema: buildSchema,
		getDescription: getDescription,
		extendSchema: extendSchema,
		lexicographicSortSchema: lexicographicSortSchema,
		printSchema: printSchema,
		printType: printType,
		printIntrospectionSchema: printIntrospectionSchema,
		typeFromAST: typeFromAST,
		valueFromAST: valueFromAST,
		valueFromASTUntyped: valueFromASTUntyped,
		astFromValue: astFromValue,
		TypeInfo: TypeInfo,
		coerceInputValue: coerceInputValue,
		coerceValue: coerceValue,
		isValidJSValue: isValidJSValue,
		isValidLiteralValue: isValidLiteralValue,
		concatAST: concatAST,
		separateOperations: separateOperations,
		stripIgnoredCharacters: stripIgnoredCharacters,
		isEqualType: isEqualType,
		isTypeSubTypeOf: isTypeSubTypeOf,
		doTypesOverlap: doTypesOverlap,
		assertValidName: assertValidName,
		isValidNameError: isValidNameError,
		BreakingChangeType: BreakingChangeType,
		DangerousChangeType: DangerousChangeType,
		findBreakingChanges: findBreakingChanges,
		findDangerousChanges: findDangerousChanges,
		findDeprecatedUsages: findDeprecatedUsages
	});

	/**
	 * GraphQL.js provides a reference implementation for the GraphQL specification
	 * but is also a useful utility for operating on GraphQL files and building
	 * sophisticated tools.
	 *
	 * This primary module exports a general purpose function for fulfilling all
	 * steps of the GraphQL specification in a single operation, but also includes
	 * utilities for every part of the GraphQL specification:
	 *
	 *   - Parsing the GraphQL language.
	 *   - Building a GraphQL type schema.
	 *   - Validating a GraphQL request against a type schema.
	 *   - Executing a GraphQL request against a type schema.
	 *
	 * This also includes utility functions for operating on GraphQL types and
	 * GraphQL documents to facilitate building tools.
	 *
	 * You may also import from each sub-directory directly. For example, the
	 * following two import statements are equivalent:
	 *
	 *     import { parse } from 'graphql';
	 *     import { parse } from 'graphql/language';
	 */

	var graphql$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		version: version,
		versionInfo: versionInfo,
		graphql: graphql,
		graphqlSync: graphqlSync,
		GraphQLSchema: GraphQLSchema,
		GraphQLDirective: GraphQLDirective,
		GraphQLScalarType: GraphQLScalarType,
		GraphQLObjectType: GraphQLObjectType,
		GraphQLInterfaceType: GraphQLInterfaceType,
		GraphQLUnionType: GraphQLUnionType,
		GraphQLEnumType: GraphQLEnumType,
		GraphQLInputObjectType: GraphQLInputObjectType,
		GraphQLList: GraphQLList,
		GraphQLNonNull: GraphQLNonNull,
		specifiedScalarTypes: specifiedScalarTypes,
		GraphQLInt: GraphQLInt,
		GraphQLFloat: GraphQLFloat,
		GraphQLString: GraphQLString,
		GraphQLBoolean: GraphQLBoolean,
		GraphQLID: GraphQLID,
		specifiedDirectives: specifiedDirectives,
		GraphQLIncludeDirective: GraphQLIncludeDirective,
		GraphQLSkipDirective: GraphQLSkipDirective,
		GraphQLDeprecatedDirective: GraphQLDeprecatedDirective,
		TypeKind: TypeKind,
		DEFAULT_DEPRECATION_REASON: DEFAULT_DEPRECATION_REASON,
		introspectionTypes: introspectionTypes,
		__Schema: __Schema,
		__Directive: __Directive,
		__DirectiveLocation: __DirectiveLocation,
		__Type: __Type,
		__Field: __Field,
		__InputValue: __InputValue,
		__EnumValue: __EnumValue,
		__TypeKind: __TypeKind,
		SchemaMetaFieldDef: SchemaMetaFieldDef,
		TypeMetaFieldDef: TypeMetaFieldDef,
		TypeNameMetaFieldDef: TypeNameMetaFieldDef,
		isSchema: isSchema,
		isDirective: isDirective,
		isType: isType,
		isScalarType: isScalarType,
		isObjectType: isObjectType,
		isInterfaceType: isInterfaceType,
		isUnionType: isUnionType,
		isEnumType: isEnumType,
		isInputObjectType: isInputObjectType,
		isListType: isListType,
		isNonNullType: isNonNullType,
		isInputType: isInputType,
		isOutputType: isOutputType,
		isLeafType: isLeafType,
		isCompositeType: isCompositeType,
		isAbstractType: isAbstractType,
		isWrappingType: isWrappingType,
		isNullableType: isNullableType,
		isNamedType: isNamedType,
		isRequiredArgument: isRequiredArgument,
		isRequiredInputField: isRequiredInputField,
		isSpecifiedScalarType: isSpecifiedScalarType,
		isIntrospectionType: isIntrospectionType,
		isSpecifiedDirective: isSpecifiedDirective,
		assertSchema: assertSchema,
		assertDirective: assertDirective,
		assertType: assertType,
		assertScalarType: assertScalarType,
		assertObjectType: assertObjectType,
		assertInterfaceType: assertInterfaceType,
		assertUnionType: assertUnionType,
		assertEnumType: assertEnumType,
		assertInputObjectType: assertInputObjectType,
		assertListType: assertListType,
		assertNonNullType: assertNonNullType,
		assertInputType: assertInputType,
		assertOutputType: assertOutputType,
		assertLeafType: assertLeafType,
		assertCompositeType: assertCompositeType,
		assertAbstractType: assertAbstractType,
		assertWrappingType: assertWrappingType,
		assertNullableType: assertNullableType,
		assertNamedType: assertNamedType,
		getNullableType: getNullableType,
		getNamedType: getNamedType,
		validateSchema: validateSchema,
		assertValidSchema: assertValidSchema,
		Source: Source,
		getLocation: getLocation,
		printLocation: printLocation,
		printSourceLocation: printSourceLocation,
		createLexer: createLexer,
		TokenKind: TokenKind,
		parse: parse,
		parseValue: parseValue,
		parseType: parseType,
		print: print,
		visit: visit,
		visitInParallel: visitInParallel,
		visitWithTypeInfo: visitWithTypeInfo,
		getVisitFn: getVisitFn,
		BREAK: BREAK,
		Kind: Kind,
		DirectiveLocation: DirectiveLocation,
		isDefinitionNode: isDefinitionNode,
		isExecutableDefinitionNode: isExecutableDefinitionNode,
		isSelectionNode: isSelectionNode,
		isValueNode: isValueNode,
		isTypeNode: isTypeNode,
		isTypeSystemDefinitionNode: isTypeSystemDefinitionNode,
		isTypeDefinitionNode: isTypeDefinitionNode,
		isTypeSystemExtensionNode: isTypeSystemExtensionNode,
		isTypeExtensionNode: isTypeExtensionNode,
		execute: execute,
		defaultFieldResolver: defaultFieldResolver,
		defaultTypeResolver: defaultTypeResolver,
		responsePathAsArray: pathToArray,
		getDirectiveValues: getDirectiveValues,
		subscribe: subscribe,
		createSourceEventStream: createSourceEventStream,
		validate: validate,
		ValidationContext: ValidationContext,
		specifiedRules: specifiedRules,
		ExecutableDefinitionsRule: ExecutableDefinitions,
		FieldsOnCorrectTypeRule: FieldsOnCorrectType,
		FragmentsOnCompositeTypesRule: FragmentsOnCompositeTypes,
		KnownArgumentNamesRule: KnownArgumentNames,
		KnownDirectivesRule: KnownDirectives,
		KnownFragmentNamesRule: KnownFragmentNames,
		KnownTypeNamesRule: KnownTypeNames,
		LoneAnonymousOperationRule: LoneAnonymousOperation,
		NoFragmentCyclesRule: NoFragmentCycles,
		NoUndefinedVariablesRule: NoUndefinedVariables,
		NoUnusedFragmentsRule: NoUnusedFragments,
		NoUnusedVariablesRule: NoUnusedVariables,
		OverlappingFieldsCanBeMergedRule: OverlappingFieldsCanBeMerged,
		PossibleFragmentSpreadsRule: PossibleFragmentSpreads,
		ProvidedRequiredArgumentsRule: ProvidedRequiredArguments,
		ScalarLeafsRule: ScalarLeafs,
		SingleFieldSubscriptionsRule: SingleFieldSubscriptions,
		UniqueArgumentNamesRule: UniqueArgumentNames,
		UniqueDirectivesPerLocationRule: UniqueDirectivesPerLocation,
		UniqueFragmentNamesRule: UniqueFragmentNames,
		UniqueInputFieldNamesRule: UniqueInputFieldNames,
		UniqueOperationNamesRule: UniqueOperationNames,
		UniqueVariableNamesRule: UniqueVariableNames,
		ValuesOfCorrectTypeRule: ValuesOfCorrectType,
		VariablesAreInputTypesRule: VariablesAreInputTypes,
		VariablesInAllowedPositionRule: VariablesInAllowedPosition,
		LoneSchemaDefinitionRule: LoneSchemaDefinition,
		UniqueOperationTypesRule: UniqueOperationTypes,
		UniqueTypeNamesRule: UniqueTypeNames,
		UniqueEnumValueNamesRule: UniqueEnumValueNames,
		UniqueFieldDefinitionNamesRule: UniqueFieldDefinitionNames,
		UniqueDirectiveNamesRule: UniqueDirectiveNames,
		PossibleTypeExtensionsRule: PossibleTypeExtensions,
		GraphQLError: GraphQLError,
		syntaxError: syntaxError,
		locatedError: locatedError,
		printError: printError,
		formatError: formatError,
		getIntrospectionQuery: getIntrospectionQuery,
		introspectionQuery: introspectionQuery,
		getOperationAST: getOperationAST,
		getOperationRootType: getOperationRootType,
		introspectionFromSchema: introspectionFromSchema,
		buildClientSchema: buildClientSchema,
		buildASTSchema: buildASTSchema,
		buildSchema: buildSchema,
		getDescription: getDescription,
		extendSchema: extendSchema,
		lexicographicSortSchema: lexicographicSortSchema,
		printSchema: printSchema,
		printType: printType,
		printIntrospectionSchema: printIntrospectionSchema,
		typeFromAST: typeFromAST,
		valueFromAST: valueFromAST,
		valueFromASTUntyped: valueFromASTUntyped,
		astFromValue: astFromValue,
		TypeInfo: TypeInfo,
		coerceInputValue: coerceInputValue,
		coerceValue: coerceValue,
		isValidJSValue: isValidJSValue,
		isValidLiteralValue: isValidLiteralValue,
		concatAST: concatAST,
		separateOperations: separateOperations,
		stripIgnoredCharacters: stripIgnoredCharacters,
		isEqualType: isEqualType,
		isTypeSubTypeOf: isTypeSubTypeOf,
		doTypesOverlap: doTypesOverlap,
		assertValidName: assertValidName,
		isValidNameError: isValidNameError,
		BreakingChangeType: BreakingChangeType,
		DangerousChangeType: DangerousChangeType,
		findBreakingChanges: findBreakingChanges,
		findDangerousChanges: findDangerousChanges,
		findDeprecatedUsages: findDeprecatedUsages
	});

	var iterators = {};

	var correctPrototypeGetter = !fails(function () {
	  function F() { /* empty */ }
	  F.prototype.constructor = null;
	  return Object.getPrototypeOf(new F()) !== F.prototype;
	});

	var IE_PROTO$1 = sharedKey('IE_PROTO');
	var ObjectPrototype = Object.prototype;

	// `Object.getPrototypeOf` method
	// https://tc39.github.io/ecma262/#sec-object.getprototypeof
	var objectGetPrototypeOf = correctPrototypeGetter ? Object.getPrototypeOf : function (O) {
	  O = toObject(O);
	  if (has(O, IE_PROTO$1)) return O[IE_PROTO$1];
	  if (typeof O.constructor == 'function' && O instanceof O.constructor) {
	    return O.constructor.prototype;
	  } return O instanceof Object ? ObjectPrototype : null;
	};

	var ITERATOR = wellKnownSymbol('iterator');
	var BUGGY_SAFARI_ITERATORS = false;

	var returnThis = function () { return this; };

	// `%IteratorPrototype%` object
	// https://tc39.github.io/ecma262/#sec-%iteratorprototype%-object
	var IteratorPrototype, PrototypeOfArrayIteratorPrototype, arrayIterator;

	if ([].keys) {
	  arrayIterator = [].keys();
	  // Safari 8 has buggy iterators w/o `next`
	  if (!('next' in arrayIterator)) BUGGY_SAFARI_ITERATORS = true;
	  else {
	    PrototypeOfArrayIteratorPrototype = objectGetPrototypeOf(objectGetPrototypeOf(arrayIterator));
	    if (PrototypeOfArrayIteratorPrototype !== Object.prototype) IteratorPrototype = PrototypeOfArrayIteratorPrototype;
	  }
	}

	if (IteratorPrototype == undefined) IteratorPrototype = {};

	// 25.1.2.1.1 %IteratorPrototype%[@@iterator]()
	if ( !has(IteratorPrototype, ITERATOR)) {
	  createNonEnumerableProperty(IteratorPrototype, ITERATOR, returnThis);
	}

	var iteratorsCore = {
	  IteratorPrototype: IteratorPrototype,
	  BUGGY_SAFARI_ITERATORS: BUGGY_SAFARI_ITERATORS
	};

	var defineProperty = objectDefineProperty.f;



	var TO_STRING_TAG = wellKnownSymbol('toStringTag');

	var setToStringTag = function (it, TAG, STATIC) {
	  if (it && !has(it = STATIC ? it : it.prototype, TO_STRING_TAG)) {
	    defineProperty(it, TO_STRING_TAG, { configurable: true, value: TAG });
	  }
	};

	var IteratorPrototype$1 = iteratorsCore.IteratorPrototype;





	var returnThis$1 = function () { return this; };

	var createIteratorConstructor = function (IteratorConstructor, NAME, next) {
	  var TO_STRING_TAG = NAME + ' Iterator';
	  IteratorConstructor.prototype = objectCreate(IteratorPrototype$1, { next: createPropertyDescriptor(1, next) });
	  setToStringTag(IteratorConstructor, TO_STRING_TAG, false);
	  iterators[TO_STRING_TAG] = returnThis$1;
	  return IteratorConstructor;
	};

	var aPossiblePrototype = function (it) {
	  if (!isObject(it) && it !== null) {
	    throw TypeError("Can't set " + String(it) + ' as a prototype');
	  } return it;
	};

	// `Object.setPrototypeOf` method
	// https://tc39.github.io/ecma262/#sec-object.setprototypeof
	// Works with __proto__ only. Old v8 can't work with null proto objects.
	/* eslint-disable no-proto */
	var objectSetPrototypeOf = Object.setPrototypeOf || ('__proto__' in {} ? function () {
	  var CORRECT_SETTER = false;
	  var test = {};
	  var setter;
	  try {
	    setter = Object.getOwnPropertyDescriptor(Object.prototype, '__proto__').set;
	    setter.call(test, []);
	    CORRECT_SETTER = test instanceof Array;
	  } catch (error) { /* empty */ }
	  return function setPrototypeOf(O, proto) {
	    anObject(O);
	    aPossiblePrototype(proto);
	    if (CORRECT_SETTER) setter.call(O, proto);
	    else O.__proto__ = proto;
	    return O;
	  };
	}() : undefined);

	var IteratorPrototype$2 = iteratorsCore.IteratorPrototype;
	var BUGGY_SAFARI_ITERATORS$1 = iteratorsCore.BUGGY_SAFARI_ITERATORS;
	var ITERATOR$1 = wellKnownSymbol('iterator');
	var KEYS = 'keys';
	var VALUES = 'values';
	var ENTRIES = 'entries';

	var returnThis$2 = function () { return this; };

	var defineIterator = function (Iterable, NAME, IteratorConstructor, next, DEFAULT, IS_SET, FORCED) {
	  createIteratorConstructor(IteratorConstructor, NAME, next);

	  var getIterationMethod = function (KIND) {
	    if (KIND === DEFAULT && defaultIterator) return defaultIterator;
	    if (!BUGGY_SAFARI_ITERATORS$1 && KIND in IterablePrototype) return IterablePrototype[KIND];
	    switch (KIND) {
	      case KEYS: return function keys() { return new IteratorConstructor(this, KIND); };
	      case VALUES: return function values() { return new IteratorConstructor(this, KIND); };
	      case ENTRIES: return function entries() { return new IteratorConstructor(this, KIND); };
	    } return function () { return new IteratorConstructor(this); };
	  };

	  var TO_STRING_TAG = NAME + ' Iterator';
	  var INCORRECT_VALUES_NAME = false;
	  var IterablePrototype = Iterable.prototype;
	  var nativeIterator = IterablePrototype[ITERATOR$1]
	    || IterablePrototype['@@iterator']
	    || DEFAULT && IterablePrototype[DEFAULT];
	  var defaultIterator = !BUGGY_SAFARI_ITERATORS$1 && nativeIterator || getIterationMethod(DEFAULT);
	  var anyNativeIterator = NAME == 'Array' ? IterablePrototype.entries || nativeIterator : nativeIterator;
	  var CurrentIteratorPrototype, methods, KEY;

	  // fix native
	  if (anyNativeIterator) {
	    CurrentIteratorPrototype = objectGetPrototypeOf(anyNativeIterator.call(new Iterable()));
	    if (IteratorPrototype$2 !== Object.prototype && CurrentIteratorPrototype.next) {
	      if ( objectGetPrototypeOf(CurrentIteratorPrototype) !== IteratorPrototype$2) {
	        if (objectSetPrototypeOf) {
	          objectSetPrototypeOf(CurrentIteratorPrototype, IteratorPrototype$2);
	        } else if (typeof CurrentIteratorPrototype[ITERATOR$1] != 'function') {
	          createNonEnumerableProperty(CurrentIteratorPrototype, ITERATOR$1, returnThis$2);
	        }
	      }
	      // Set @@toStringTag to native iterators
	      setToStringTag(CurrentIteratorPrototype, TO_STRING_TAG, true);
	    }
	  }

	  // fix Array#{values, @@iterator}.name in V8 / FF
	  if (DEFAULT == VALUES && nativeIterator && nativeIterator.name !== VALUES) {
	    INCORRECT_VALUES_NAME = true;
	    defaultIterator = function values() { return nativeIterator.call(this); };
	  }

	  // define iterator
	  if ( IterablePrototype[ITERATOR$1] !== defaultIterator) {
	    createNonEnumerableProperty(IterablePrototype, ITERATOR$1, defaultIterator);
	  }
	  iterators[NAME] = defaultIterator;

	  // export additional methods
	  if (DEFAULT) {
	    methods = {
	      values: getIterationMethod(VALUES),
	      keys: IS_SET ? defaultIterator : getIterationMethod(KEYS),
	      entries: getIterationMethod(ENTRIES)
	    };
	    if (FORCED) for (KEY in methods) {
	      if (BUGGY_SAFARI_ITERATORS$1 || INCORRECT_VALUES_NAME || !(KEY in IterablePrototype)) {
	        redefine(IterablePrototype, KEY, methods[KEY]);
	      }
	    } else _export({ target: NAME, proto: true, forced: BUGGY_SAFARI_ITERATORS$1 || INCORRECT_VALUES_NAME }, methods);
	  }

	  return methods;
	};

	var ARRAY_ITERATOR = 'Array Iterator';
	var setInternalState = internalState.set;
	var getInternalState = internalState.getterFor(ARRAY_ITERATOR);

	// `Array.prototype.entries` method
	// https://tc39.github.io/ecma262/#sec-array.prototype.entries
	// `Array.prototype.keys` method
	// https://tc39.github.io/ecma262/#sec-array.prototype.keys
	// `Array.prototype.values` method
	// https://tc39.github.io/ecma262/#sec-array.prototype.values
	// `Array.prototype[@@iterator]` method
	// https://tc39.github.io/ecma262/#sec-array.prototype-@@iterator
	// `CreateArrayIterator` internal method
	// https://tc39.github.io/ecma262/#sec-createarrayiterator
	var es_array_iterator = defineIterator(Array, 'Array', function (iterated, kind) {
	  setInternalState(this, {
	    type: ARRAY_ITERATOR,
	    target: toIndexedObject(iterated), // target
	    index: 0,                          // next index
	    kind: kind                         // kind
	  });
	// `%ArrayIteratorPrototype%.next` method
	// https://tc39.github.io/ecma262/#sec-%arrayiteratorprototype%.next
	}, function () {
	  var state = getInternalState(this);
	  var target = state.target;
	  var kind = state.kind;
	  var index = state.index++;
	  if (!target || index >= target.length) {
	    state.target = undefined;
	    return { value: undefined, done: true };
	  }
	  if (kind == 'keys') return { value: index, done: false };
	  if (kind == 'values') return { value: target[index], done: false };
	  return { value: [index, target[index]], done: false };
	}, 'values');

	// argumentsList[@@iterator] is %ArrayProto_values%
	// https://tc39.github.io/ecma262/#sec-createunmappedargumentsobject
	// https://tc39.github.io/ecma262/#sec-createmappedargumentsobject
	iterators.Arguments = iterators.Array;

	// https://tc39.github.io/ecma262/#sec-array.prototype-@@unscopables
	addToUnscopables('keys');
	addToUnscopables('values');
	addToUnscopables('entries');

	var ITERATOR$2 = wellKnownSymbol('iterator');
	var ArrayPrototype$1 = Array.prototype;

	// check on default Array iterator
	var isArrayIteratorMethod = function (it) {
	  return it !== undefined && (iterators.Array === it || ArrayPrototype$1[ITERATOR$2] === it);
	};

	var TO_STRING_TAG$1 = wellKnownSymbol('toStringTag');
	var test = {};

	test[TO_STRING_TAG$1] = 'z';

	var toStringTagSupport = String(test) === '[object z]';

	var TO_STRING_TAG$2 = wellKnownSymbol('toStringTag');
	// ES3 wrong here
	var CORRECT_ARGUMENTS = classofRaw(function () { return arguments; }()) == 'Arguments';

	// fallback for IE11 Script Access Denied error
	var tryGet = function (it, key) {
	  try {
	    return it[key];
	  } catch (error) { /* empty */ }
	};

	// getting tag from ES6+ `Object.prototype.toString`
	var classof = toStringTagSupport ? classofRaw : function (it) {
	  var O, tag, result;
	  return it === undefined ? 'Undefined' : it === null ? 'Null'
	    // @@toStringTag case
	    : typeof (tag = tryGet(O = Object(it), TO_STRING_TAG$2)) == 'string' ? tag
	    // builtinTag case
	    : CORRECT_ARGUMENTS ? classofRaw(O)
	    // ES3 arguments fallback
	    : (result = classofRaw(O)) == 'Object' && typeof O.callee == 'function' ? 'Arguments' : result;
	};

	var ITERATOR$3 = wellKnownSymbol('iterator');

	var getIteratorMethod$1 = function (it) {
	  if (it != undefined) return it[ITERATOR$3]
	    || it['@@iterator']
	    || iterators[classof(it)];
	};

	// call something on iterator step with safe closing on error
	var callWithSafeIterationClosing = function (iterator, fn, value, ENTRIES) {
	  try {
	    return ENTRIES ? fn(anObject(value)[0], value[1]) : fn(value);
	  // 7.4.6 IteratorClose(iterator, completion)
	  } catch (error) {
	    var returnMethod = iterator['return'];
	    if (returnMethod !== undefined) anObject(returnMethod.call(iterator));
	    throw error;
	  }
	};

	var iterate_1 = createCommonjsModule(function (module) {
	var Result = function (stopped, result) {
	  this.stopped = stopped;
	  this.result = result;
	};

	var iterate = module.exports = function (iterable, fn, that, AS_ENTRIES, IS_ITERATOR) {
	  var boundFunction = functionBindContext(fn, that, AS_ENTRIES ? 2 : 1);
	  var iterator, iterFn, index, length, result, next, step;

	  if (IS_ITERATOR) {
	    iterator = iterable;
	  } else {
	    iterFn = getIteratorMethod$1(iterable);
	    if (typeof iterFn != 'function') throw TypeError('Target is not iterable');
	    // optimisation for array iterators
	    if (isArrayIteratorMethod(iterFn)) {
	      for (index = 0, length = toLength(iterable.length); length > index; index++) {
	        result = AS_ENTRIES
	          ? boundFunction(anObject(step = iterable[index])[0], step[1])
	          : boundFunction(iterable[index]);
	        if (result && result instanceof Result) return result;
	      } return new Result(false);
	    }
	    iterator = iterFn.call(iterable);
	  }

	  next = iterator.next;
	  while (!(step = next.call(iterator)).done) {
	    result = callWithSafeIterationClosing(iterator, boundFunction, step.value, AS_ENTRIES);
	    if (typeof result == 'object' && result && result instanceof Result) return result;
	  } return new Result(false);
	};

	iterate.stop = function (result) {
	  return new Result(true, result);
	};
	});

	var createProperty = function (object, key, value) {
	  var propertyKey = toPrimitive(key);
	  if (propertyKey in object) objectDefineProperty.f(object, propertyKey, createPropertyDescriptor(0, value));
	  else object[propertyKey] = value;
	};

	// `Object.fromEntries` method
	// https://github.com/tc39/proposal-object-from-entries
	_export({ target: 'Object', stat: true }, {
	  fromEntries: function fromEntries(iterable) {
	    var obj = {};
	    iterate_1(iterable, function (k, v) {
	      createProperty(obj, k, v);
	    }, undefined, true);
	    return obj;
	  }
	});

	var fromEntries = path.Object.fromEntries;

	var fetch_1 = node_fetch_1__default['default'].default;
	var Request = node_fetch_1__default['default'].Request;
	var Response = node_fetch_1__default['default'].Response;
	var Headers = node_fetch_1__default['default'].Headers;
	var Body = node_fetch_1__default['default'].Body;


	var fetch = /*#__PURE__*/Object.defineProperty({
		fetch: fetch_1,
		Request: Request,
		Response: Response,
		Headers: Headers,
		Body: Body
	}, '__esModule', {value: true});

	/*! https://mths.be/punycode v1.4.1 by @mathias */


	/** Highest positive signed 32-bit float value */
	var maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	var base = 36;
	var tMin = 1;
	var tMax = 26;
	var skew = 38;
	var damp = 700;
	var initialBias = 72;
	var initialN = 128; // 0x80
	var delimiter = '-'; // '\x2D'
	var regexNonASCII = /[^\x20-\x7E]/; // unprintable ASCII chars + non-ASCII chars
	var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators

	/** Error messages */
	var errors = {
	  'overflow': 'Overflow: input needs wider integers to process',
	  'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
	  'invalid-input': 'Invalid input'
	};

	/** Convenience shortcuts */
	var baseMinusTMin = base - tMin;
	var floor$1 = Math.floor;
	var stringFromCharCode = String.fromCharCode;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
	  throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
	  var length = array.length;
	  var result = [];
	  while (length--) {
	    result[length] = fn(array[length]);
	  }
	  return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
	  var parts = string.split('@');
	  var result = '';
	  if (parts.length > 1) {
	    // In email addresses, only the domain name should be punycoded. Leave
	    // the local part (i.e. everything up to `@`) intact.
	    result = parts[0] + '@';
	    string = parts[1];
	  }
	  // Avoid `split(regex)` for IE8 compatibility. See #17.
	  string = string.replace(regexSeparators, '\x2E');
	  var labels = string.split('.');
	  var encoded = map(labels, fn).join('.');
	  return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
	  var output = [],
	    counter = 0,
	    length = string.length,
	    value,
	    extra;
	  while (counter < length) {
	    value = string.charCodeAt(counter++);
	    if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
	      // high surrogate, and there is a next character
	      extra = string.charCodeAt(counter++);
	      if ((extra & 0xFC00) == 0xDC00) { // low surrogate
	        output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
	      } else {
	        // unmatched surrogate; only append this code unit, in case the next
	        // code unit is the high surrogate of a surrogate pair
	        output.push(value);
	        counter--;
	      }
	    } else {
	      output.push(value);
	    }
	  }
	  return output;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
	  //  0..25 map to ASCII a..z or A..Z
	  // 26..35 map to ASCII 0..9
	  return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
	  var k = 0;
	  delta = firstTime ? floor$1(delta / damp) : delta >> 1;
	  delta += floor$1(delta / numPoints);
	  for ( /* no initialization */ ; delta > baseMinusTMin * tMax >> 1; k += base) {
	    delta = floor$1(delta / baseMinusTMin);
	  }
	  return floor$1(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
	  var n,
	    delta,
	    handledCPCount,
	    basicLength,
	    bias,
	    j,
	    m,
	    q,
	    k,
	    t,
	    currentValue,
	    output = [],
	    /** `inputLength` will hold the number of code points in `input`. */
	    inputLength,
	    /** Cached calculation results */
	    handledCPCountPlusOne,
	    baseMinusT,
	    qMinusT;

	  // Convert the input in UCS-2 to Unicode
	  input = ucs2decode(input);

	  // Cache the length
	  inputLength = input.length;

	  // Initialize the state
	  n = initialN;
	  delta = 0;
	  bias = initialBias;

	  // Handle the basic code points
	  for (j = 0; j < inputLength; ++j) {
	    currentValue = input[j];
	    if (currentValue < 0x80) {
	      output.push(stringFromCharCode(currentValue));
	    }
	  }

	  handledCPCount = basicLength = output.length;

	  // `handledCPCount` is the number of code points that have been handled;
	  // `basicLength` is the number of basic code points.

	  // Finish the basic string - if it is not empty - with a delimiter
	  if (basicLength) {
	    output.push(delimiter);
	  }

	  // Main encoding loop:
	  while (handledCPCount < inputLength) {

	    // All non-basic code points < n have been handled already. Find the next
	    // larger one:
	    for (m = maxInt, j = 0; j < inputLength; ++j) {
	      currentValue = input[j];
	      if (currentValue >= n && currentValue < m) {
	        m = currentValue;
	      }
	    }

	    // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
	    // but guard against overflow
	    handledCPCountPlusOne = handledCPCount + 1;
	    if (m - n > floor$1((maxInt - delta) / handledCPCountPlusOne)) {
	      error('overflow');
	    }

	    delta += (m - n) * handledCPCountPlusOne;
	    n = m;

	    for (j = 0; j < inputLength; ++j) {
	      currentValue = input[j];

	      if (currentValue < n && ++delta > maxInt) {
	        error('overflow');
	      }

	      if (currentValue == n) {
	        // Represent delta as a generalized variable-length integer
	        for (q = delta, k = base; /* no condition */ ; k += base) {
	          t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
	          if (q < t) {
	            break;
	          }
	          qMinusT = q - t;
	          baseMinusT = base - t;
	          output.push(
	            stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
	          );
	          q = floor$1(qMinusT / baseMinusT);
	        }

	        output.push(stringFromCharCode(digitToBasic(q, 0)));
	        bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
	        delta = 0;
	        ++handledCPCount;
	      }
	    }

	    ++delta;
	    ++n;

	  }
	  return output.join('');
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
	  return mapDomain(input, function(string) {
	    return regexNonASCII.test(string) ?
	      'xn--' + encode(string) :
	      string;
	  });
	}

	var inherits;
	if (typeof Object.create === 'function'){
	  inherits = function inherits(ctor, superCtor) {
	    // implementation from standard node.js 'util' module
	    ctor.super_ = superCtor;
	    ctor.prototype = Object.create(superCtor.prototype, {
	      constructor: {
	        value: ctor,
	        enumerable: false,
	        writable: true,
	        configurable: true
	      }
	    });
	  };
	} else {
	  inherits = function inherits(ctor, superCtor) {
	    ctor.super_ = superCtor;
	    var TempCtor = function () {};
	    TempCtor.prototype = superCtor.prototype;
	    ctor.prototype = new TempCtor();
	    ctor.prototype.constructor = ctor;
	  };
	}
	var inherits$1 = inherits;

	// Copyright Joyent, Inc. and other Node contributors.
	var formatRegExp = /%[sdj%]/g;
	function format(f) {
	  if (!isString(f)) {
	    var objects = [];
	    for (var i = 0; i < arguments.length; i++) {
	      objects.push(inspect$1(arguments[i]));
	    }
	    return objects.join(' ');
	  }

	  var i = 1;
	  var args = arguments;
	  var len = args.length;
	  var str = String(f).replace(formatRegExp, function(x) {
	    if (x === '%%') return '%';
	    if (i >= len) return x;
	    switch (x) {
	      case '%s': return String(args[i++]);
	      case '%d': return Number(args[i++]);
	      case '%j':
	        try {
	          return JSON.stringify(args[i++]);
	        } catch (_) {
	          return '[Circular]';
	        }
	      default:
	        return x;
	    }
	  });
	  for (var x = args[i]; i < len; x = args[++i]) {
	    if (isNull(x) || !isObject$1(x)) {
	      str += ' ' + x;
	    } else {
	      str += ' ' + inspect$1(x);
	    }
	  }
	  return str;
	}

	// Mark that a method should not be used.
	// Returns a modified function which warns once by default.
	// If --no-deprecation is set, then it is a no-op.
	function deprecate(fn, msg) {
	  // Allow for deprecating things in the process of starting up.
	  if (isUndefined(global.process)) {
	    return function() {
	      return deprecate(fn, msg).apply(this, arguments);
	    };
	  }

	  var warned = false;
	  function deprecated() {
	    if (!warned) {
	      {
	        console.error(msg);
	      }
	      warned = true;
	    }
	    return fn.apply(this, arguments);
	  }

	  return deprecated;
	}

	var debugs = {};
	var debugEnviron;
	function debuglog(set) {
	  if (isUndefined(debugEnviron))
	    debugEnviron =  '';
	  set = set.toUpperCase();
	  if (!debugs[set]) {
	    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
	      var pid = 0;
	      debugs[set] = function() {
	        var msg = format.apply(null, arguments);
	        console.error('%s %d: %s', set, pid, msg);
	      };
	    } else {
	      debugs[set] = function() {};
	    }
	  }
	  return debugs[set];
	}

	/**
	 * Echos the value of a value. Trys to print the value out
	 * in the best way possible given the different types.
	 *
	 * @param {Object} obj The object to print out.
	 * @param {Object} opts Optional options object that alters the output.
	 */
	/* legacy: obj, showHidden, depth, colors*/
	function inspect$1(obj, opts) {
	  // default options
	  var ctx = {
	    seen: [],
	    stylize: stylizeNoColor
	  };
	  // legacy...
	  if (arguments.length >= 3) ctx.depth = arguments[2];
	  if (arguments.length >= 4) ctx.colors = arguments[3];
	  if (isBoolean(opts)) {
	    // legacy...
	    ctx.showHidden = opts;
	  } else if (opts) {
	    // got an "options" object
	    _extend(ctx, opts);
	  }
	  // set default options
	  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
	  if (isUndefined(ctx.depth)) ctx.depth = 2;
	  if (isUndefined(ctx.colors)) ctx.colors = false;
	  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
	  if (ctx.colors) ctx.stylize = stylizeWithColor;
	  return formatValue$1(ctx, obj, ctx.depth);
	}

	// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
	inspect$1.colors = {
	  'bold' : [1, 22],
	  'italic' : [3, 23],
	  'underline' : [4, 24],
	  'inverse' : [7, 27],
	  'white' : [37, 39],
	  'grey' : [90, 39],
	  'black' : [30, 39],
	  'blue' : [34, 39],
	  'cyan' : [36, 39],
	  'green' : [32, 39],
	  'magenta' : [35, 39],
	  'red' : [31, 39],
	  'yellow' : [33, 39]
	};

	// Don't use 'blue' not visible on cmd.exe
	inspect$1.styles = {
	  'special': 'cyan',
	  'number': 'yellow',
	  'boolean': 'yellow',
	  'undefined': 'grey',
	  'null': 'bold',
	  'string': 'green',
	  'date': 'magenta',
	  // "name": intentionally not styling
	  'regexp': 'red'
	};


	function stylizeWithColor(str, styleType) {
	  var style = inspect$1.styles[styleType];

	  if (style) {
	    return '\u001b[' + inspect$1.colors[style][0] + 'm' + str +
	           '\u001b[' + inspect$1.colors[style][1] + 'm';
	  } else {
	    return str;
	  }
	}


	function stylizeNoColor(str, styleType) {
	  return str;
	}


	function arrayToHash(array) {
	  var hash = {};

	  array.forEach(function(val, idx) {
	    hash[val] = true;
	  });

	  return hash;
	}


	function formatValue$1(ctx, value, recurseTimes) {
	  // Provide a hook for user-specified inspect functions.
	  // Check that value is an object with an inspect function on it
	  if (ctx.customInspect &&
	      value &&
	      isFunction(value.inspect) &&
	      // Filter out the util module, it's inspect function is special
	      value.inspect !== inspect$1 &&
	      // Also filter out any prototype objects using the circular check.
	      !(value.constructor && value.constructor.prototype === value)) {
	    var ret = value.inspect(recurseTimes, ctx);
	    if (!isString(ret)) {
	      ret = formatValue$1(ctx, ret, recurseTimes);
	    }
	    return ret;
	  }

	  // Primitive types cannot have properties
	  var primitive = formatPrimitive(ctx, value);
	  if (primitive) {
	    return primitive;
	  }

	  // Look up the keys of the object.
	  var keys = Object.keys(value);
	  var visibleKeys = arrayToHash(keys);

	  if (ctx.showHidden) {
	    keys = Object.getOwnPropertyNames(value);
	  }

	  // IE doesn't make error fields non-enumerable
	  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
	  if (isError(value)
	      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
	    return formatError$1(value);
	  }

	  // Some type of object without properties can be shortcutted.
	  if (keys.length === 0) {
	    if (isFunction(value)) {
	      var name = value.name ? ': ' + value.name : '';
	      return ctx.stylize('[Function' + name + ']', 'special');
	    }
	    if (isRegExp(value)) {
	      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
	    }
	    if (isDate(value)) {
	      return ctx.stylize(Date.prototype.toString.call(value), 'date');
	    }
	    if (isError(value)) {
	      return formatError$1(value);
	    }
	  }

	  var base = '', array = false, braces = ['{', '}'];

	  // Make Array say that they are Array
	  if (isArray$1(value)) {
	    array = true;
	    braces = ['[', ']'];
	  }

	  // Make functions say that they are functions
	  if (isFunction(value)) {
	    var n = value.name ? ': ' + value.name : '';
	    base = ' [Function' + n + ']';
	  }

	  // Make RegExps say that they are RegExps
	  if (isRegExp(value)) {
	    base = ' ' + RegExp.prototype.toString.call(value);
	  }

	  // Make dates with properties first say the date
	  if (isDate(value)) {
	    base = ' ' + Date.prototype.toUTCString.call(value);
	  }

	  // Make error with message first say the error
	  if (isError(value)) {
	    base = ' ' + formatError$1(value);
	  }

	  if (keys.length === 0 && (!array || value.length == 0)) {
	    return braces[0] + base + braces[1];
	  }

	  if (recurseTimes < 0) {
	    if (isRegExp(value)) {
	      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
	    } else {
	      return ctx.stylize('[Object]', 'special');
	    }
	  }

	  ctx.seen.push(value);

	  var output;
	  if (array) {
	    output = formatArray$1(ctx, value, recurseTimes, visibleKeys, keys);
	  } else {
	    output = keys.map(function(key) {
	      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
	    });
	  }

	  ctx.seen.pop();

	  return reduceToSingleString(output, base, braces);
	}


	function formatPrimitive(ctx, value) {
	  if (isUndefined(value))
	    return ctx.stylize('undefined', 'undefined');
	  if (isString(value)) {
	    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
	                                             .replace(/'/g, "\\'")
	                                             .replace(/\\"/g, '"') + '\'';
	    return ctx.stylize(simple, 'string');
	  }
	  if (isNumber(value))
	    return ctx.stylize('' + value, 'number');
	  if (isBoolean(value))
	    return ctx.stylize('' + value, 'boolean');
	  // For some reason typeof null is "object", so special case here.
	  if (isNull(value))
	    return ctx.stylize('null', 'null');
	}


	function formatError$1(value) {
	  return '[' + Error.prototype.toString.call(value) + ']';
	}


	function formatArray$1(ctx, value, recurseTimes, visibleKeys, keys) {
	  var output = [];
	  for (var i = 0, l = value.length; i < l; ++i) {
	    if (hasOwnProperty$2(value, String(i))) {
	      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
	          String(i), true));
	    } else {
	      output.push('');
	    }
	  }
	  keys.forEach(function(key) {
	    if (!key.match(/^\d+$/)) {
	      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
	          key, true));
	    }
	  });
	  return output;
	}


	function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
	  var name, str, desc;
	  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
	  if (desc.get) {
	    if (desc.set) {
	      str = ctx.stylize('[Getter/Setter]', 'special');
	    } else {
	      str = ctx.stylize('[Getter]', 'special');
	    }
	  } else {
	    if (desc.set) {
	      str = ctx.stylize('[Setter]', 'special');
	    }
	  }
	  if (!hasOwnProperty$2(visibleKeys, key)) {
	    name = '[' + key + ']';
	  }
	  if (!str) {
	    if (ctx.seen.indexOf(desc.value) < 0) {
	      if (isNull(recurseTimes)) {
	        str = formatValue$1(ctx, desc.value, null);
	      } else {
	        str = formatValue$1(ctx, desc.value, recurseTimes - 1);
	      }
	      if (str.indexOf('\n') > -1) {
	        if (array) {
	          str = str.split('\n').map(function(line) {
	            return '  ' + line;
	          }).join('\n').substr(2);
	        } else {
	          str = '\n' + str.split('\n').map(function(line) {
	            return '   ' + line;
	          }).join('\n');
	        }
	      }
	    } else {
	      str = ctx.stylize('[Circular]', 'special');
	    }
	  }
	  if (isUndefined(name)) {
	    if (array && key.match(/^\d+$/)) {
	      return str;
	    }
	    name = JSON.stringify('' + key);
	    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
	      name = name.substr(1, name.length - 2);
	      name = ctx.stylize(name, 'name');
	    } else {
	      name = name.replace(/'/g, "\\'")
	                 .replace(/\\"/g, '"')
	                 .replace(/(^"|"$)/g, "'");
	      name = ctx.stylize(name, 'string');
	    }
	  }

	  return name + ': ' + str;
	}


	function reduceToSingleString(output, base, braces) {
	  var length = output.reduce(function(prev, cur) {
	    if (cur.indexOf('\n') >= 0) ;
	    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
	  }, 0);

	  if (length > 60) {
	    return braces[0] +
	           (base === '' ? '' : base + '\n ') +
	           ' ' +
	           output.join(',\n  ') +
	           ' ' +
	           braces[1];
	  }

	  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
	}


	// NOTE: These type checking functions intentionally don't use `instanceof`
	// because it is fragile and can be easily faked with `Object.create()`.
	function isArray$1(ar) {
	  return Array.isArray(ar);
	}

	function isBoolean(arg) {
	  return typeof arg === 'boolean';
	}

	function isNull(arg) {
	  return arg === null;
	}

	function isNullOrUndefined(arg) {
	  return arg == null;
	}

	function isNumber(arg) {
	  return typeof arg === 'number';
	}

	function isString(arg) {
	  return typeof arg === 'string';
	}

	function isSymbol(arg) {
	  return typeof arg === 'symbol';
	}

	function isUndefined(arg) {
	  return arg === void 0;
	}

	function isRegExp(re) {
	  return isObject$1(re) && objectToString(re) === '[object RegExp]';
	}

	function isObject$1(arg) {
	  return typeof arg === 'object' && arg !== null;
	}

	function isDate(d) {
	  return isObject$1(d) && objectToString(d) === '[object Date]';
	}

	function isError(e) {
	  return isObject$1(e) &&
	      (objectToString(e) === '[object Error]' || e instanceof Error);
	}

	function isFunction(arg) {
	  return typeof arg === 'function';
	}

	function isPrimitive(arg) {
	  return arg === null ||
	         typeof arg === 'boolean' ||
	         typeof arg === 'number' ||
	         typeof arg === 'string' ||
	         typeof arg === 'symbol' ||  // ES6 symbol
	         typeof arg === 'undefined';
	}

	function isBuffer(maybeBuf) {
	  return Buffer.isBuffer(maybeBuf);
	}

	function objectToString(o) {
	  return Object.prototype.toString.call(o);
	}


	function pad(n) {
	  return n < 10 ? '0' + n.toString(10) : n.toString(10);
	}


	var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
	              'Oct', 'Nov', 'Dec'];

	// 26 Feb 16:19:34
	function timestamp() {
	  var d = new Date();
	  var time = [pad(d.getHours()),
	              pad(d.getMinutes()),
	              pad(d.getSeconds())].join(':');
	  return [d.getDate(), months[d.getMonth()], time].join(' ');
	}


	// log is just a thin wrapper to console.log that prepends a timestamp
	function log() {
	  console.log('%s - %s', timestamp(), format.apply(null, arguments));
	}

	function _extend(origin, add) {
	  // Don't do anything if add isn't an object
	  if (!add || !isObject$1(add)) return origin;

	  var keys = Object.keys(add);
	  var i = keys.length;
	  while (i--) {
	    origin[keys[i]] = add[keys[i]];
	  }
	  return origin;
	}
	function hasOwnProperty$2(obj, prop) {
	  return Object.prototype.hasOwnProperty.call(obj, prop);
	}

	var util = {
	  inherits: inherits$1,
	  _extend: _extend,
	  log: log,
	  isBuffer: isBuffer,
	  isPrimitive: isPrimitive,
	  isFunction: isFunction,
	  isError: isError,
	  isDate: isDate,
	  isObject: isObject$1,
	  isRegExp: isRegExp,
	  isUndefined: isUndefined,
	  isSymbol: isSymbol,
	  isString: isString,
	  isNumber: isNumber,
	  isNullOrUndefined: isNullOrUndefined,
	  isNull: isNull,
	  isBoolean: isBoolean,
	  isArray: isArray$1,
	  inspect: inspect$1,
	  deprecate: deprecate,
	  format: format,
	  debuglog: debuglog
	};

	var util$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		format: format,
		deprecate: deprecate,
		debuglog: debuglog,
		inspect: inspect$1,
		isArray: isArray$1,
		isBoolean: isBoolean,
		isNull: isNull,
		isNullOrUndefined: isNullOrUndefined,
		isNumber: isNumber,
		isString: isString,
		isSymbol: isSymbol,
		isUndefined: isUndefined,
		isRegExp: isRegExp,
		isObject: isObject$1,
		isDate: isDate,
		isError: isError,
		isFunction: isFunction,
		isPrimitive: isPrimitive,
		isBuffer: isBuffer,
		log: log,
		inherits: inherits$1,
		_extend: _extend,
		'default': util
	});

	// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.


	// If obj.hasOwnProperty has been overridden, then calling
	// obj.hasOwnProperty(prop) will break.
	// See: https://github.com/joyent/node/issues/1707
	function hasOwnProperty$3(obj, prop) {
	  return Object.prototype.hasOwnProperty.call(obj, prop);
	}
	var isArray$2 = Array.isArray || function (xs) {
	  return Object.prototype.toString.call(xs) === '[object Array]';
	};
	function stringifyPrimitive(v) {
	  switch (typeof v) {
	    case 'string':
	      return v;

	    case 'boolean':
	      return v ? 'true' : 'false';

	    case 'number':
	      return isFinite(v) ? v : '';

	    default:
	      return '';
	  }
	}

	function stringify (obj, sep, eq, name) {
	  sep = sep || '&';
	  eq = eq || '=';
	  if (obj === null) {
	    obj = undefined;
	  }

	  if (typeof obj === 'object') {
	    return map$1(objectKeys$1(obj), function(k) {
	      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
	      if (isArray$2(obj[k])) {
	        return map$1(obj[k], function(v) {
	          return ks + encodeURIComponent(stringifyPrimitive(v));
	        }).join(sep);
	      } else {
	        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
	      }
	    }).join(sep);

	  }

	  if (!name) return '';
	  return encodeURIComponent(stringifyPrimitive(name)) + eq +
	         encodeURIComponent(stringifyPrimitive(obj));
	}
	function map$1 (xs, f) {
	  if (xs.map) return xs.map(f);
	  var res = [];
	  for (var i = 0; i < xs.length; i++) {
	    res.push(f(xs[i], i));
	  }
	  return res;
	}

	var objectKeys$1 = Object.keys || function (obj) {
	  var res = [];
	  for (var key in obj) {
	    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
	  }
	  return res;
	};

	function parse$1(qs, sep, eq, options) {
	  sep = sep || '&';
	  eq = eq || '=';
	  var obj = {};

	  if (typeof qs !== 'string' || qs.length === 0) {
	    return obj;
	  }

	  var regexp = /\+/g;
	  qs = qs.split(sep);

	  var maxKeys = 1000;
	  if (options && typeof options.maxKeys === 'number') {
	    maxKeys = options.maxKeys;
	  }

	  var len = qs.length;
	  // maxKeys <= 0 means that we should not limit keys count
	  if (maxKeys > 0 && len > maxKeys) {
	    len = maxKeys;
	  }

	  for (var i = 0; i < len; ++i) {
	    var x = qs[i].replace(regexp, '%20'),
	        idx = x.indexOf(eq),
	        kstr, vstr, k, v;

	    if (idx >= 0) {
	      kstr = x.substr(0, idx);
	      vstr = x.substr(idx + 1);
	    } else {
	      kstr = x;
	      vstr = '';
	    }

	    k = decodeURIComponent(kstr);
	    v = decodeURIComponent(vstr);

	    if (!hasOwnProperty$3(obj, k)) {
	      obj[k] = v;
	    } else if (isArray$2(obj[k])) {
	      obj[k].push(v);
	    } else {
	      obj[k] = [obj[k], v];
	    }
	  }

	  return obj;
	}

	// Copyright Joyent, Inc. and other Node contributors.
	var url = {
	  parse: urlParse,
	  resolve: urlResolve,
	  resolveObject: urlResolveObject,
	  format: urlFormat,
	  Url: Url
	};
	function Url() {
	  this.protocol = null;
	  this.slashes = null;
	  this.auth = null;
	  this.host = null;
	  this.port = null;
	  this.hostname = null;
	  this.hash = null;
	  this.search = null;
	  this.query = null;
	  this.pathname = null;
	  this.path = null;
	  this.href = null;
	}

	// Reference: RFC 3986, RFC 1808, RFC 2396

	// define these here so at least they only have to be
	// compiled once on the first module load.
	var protocolPattern = /^([a-z0-9.+-]+:)/i,
	  portPattern = /:[0-9]*$/,

	  // Special case for a simple path URL
	  simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

	  // RFC 2396: characters reserved for delimiting URLs.
	  // We actually just auto-escape these.
	  delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

	  // RFC 2396: characters not allowed for various reasons.
	  unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

	  // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
	  autoEscape = ['\''].concat(unwise),
	  // Characters that are never ever allowed in a hostname.
	  // Note that any invalid chars are also handled, but these
	  // are the ones that are *expected* to be seen, so we fast-path
	  // them.
	  nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
	  hostEndingChars = ['/', '?', '#'],
	  hostnameMaxLen = 255,
	  hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
	  hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
	  // protocols that can allow "unsafe" and "unwise" chars.
	  unsafeProtocol = {
	    'javascript': true,
	    'javascript:': true
	  },
	  // protocols that never have a hostname.
	  hostlessProtocol = {
	    'javascript': true,
	    'javascript:': true
	  },
	  // protocols that always contain a // bit.
	  slashedProtocol = {
	    'http': true,
	    'https': true,
	    'ftp': true,
	    'gopher': true,
	    'file': true,
	    'http:': true,
	    'https:': true,
	    'ftp:': true,
	    'gopher:': true,
	    'file:': true
	  };

	function urlParse(url, parseQueryString, slashesDenoteHost) {
	  if (url && isObject$1(url) && url instanceof Url) return url;

	  var u = new Url;
	  u.parse(url, parseQueryString, slashesDenoteHost);
	  return u;
	}
	Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
	  return parse$2(this, url, parseQueryString, slashesDenoteHost);
	};

	function parse$2(self, url, parseQueryString, slashesDenoteHost) {
	  if (!isString(url)) {
	    throw new TypeError('Parameter \'url\' must be a string, not ' + typeof url);
	  }

	  // Copy chrome, IE, opera backslash-handling behavior.
	  // Back slashes before the query string get converted to forward slashes
	  // See: https://code.google.com/p/chromium/issues/detail?id=25916
	  var queryIndex = url.indexOf('?'),
	    splitter =
	    (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
	    uSplit = url.split(splitter),
	    slashRegex = /\\/g;
	  uSplit[0] = uSplit[0].replace(slashRegex, '/');
	  url = uSplit.join(splitter);

	  var rest = url;

	  // trim before proceeding.
	  // This is to support parse stuff like "  http://foo.com  \n"
	  rest = rest.trim();

	  if (!slashesDenoteHost && url.split('#').length === 1) {
	    // Try fast path regexp
	    var simplePath = simplePathPattern.exec(rest);
	    if (simplePath) {
	      self.path = rest;
	      self.href = rest;
	      self.pathname = simplePath[1];
	      if (simplePath[2]) {
	        self.search = simplePath[2];
	        if (parseQueryString) {
	          self.query = parse$1(self.search.substr(1));
	        } else {
	          self.query = self.search.substr(1);
	        }
	      } else if (parseQueryString) {
	        self.search = '';
	        self.query = {};
	      }
	      return self;
	    }
	  }

	  var proto = protocolPattern.exec(rest);
	  if (proto) {
	    proto = proto[0];
	    var lowerProto = proto.toLowerCase();
	    self.protocol = lowerProto;
	    rest = rest.substr(proto.length);
	  }

	  // figure out if it's got a host
	  // user@server is *always* interpreted as a hostname, and url
	  // resolution will treat //foo/bar as host=foo,path=bar because that's
	  // how the browser resolves relative URLs.
	  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
	    var slashes = rest.substr(0, 2) === '//';
	    if (slashes && !(proto && hostlessProtocol[proto])) {
	      rest = rest.substr(2);
	      self.slashes = true;
	    }
	  }
	  var i, hec, l, p;
	  if (!hostlessProtocol[proto] &&
	    (slashes || (proto && !slashedProtocol[proto]))) {

	    // there's a hostname.
	    // the first instance of /, ?, ;, or # ends the host.
	    //
	    // If there is an @ in the hostname, then non-host chars *are* allowed
	    // to the left of the last @ sign, unless some host-ending character
	    // comes *before* the @-sign.
	    // URLs are obnoxious.
	    //
	    // ex:
	    // http://a@b@c/ => user:a@b host:c
	    // http://a@b?@c => user:a host:c path:/?@c

	    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
	    // Review our test case against browsers more comprehensively.

	    // find the first instance of any hostEndingChars
	    var hostEnd = -1;
	    for (i = 0; i < hostEndingChars.length; i++) {
	      hec = rest.indexOf(hostEndingChars[i]);
	      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
	        hostEnd = hec;
	    }

	    // at this point, either we have an explicit point where the
	    // auth portion cannot go past, or the last @ char is the decider.
	    var auth, atSign;
	    if (hostEnd === -1) {
	      // atSign can be anywhere.
	      atSign = rest.lastIndexOf('@');
	    } else {
	      // atSign must be in auth portion.
	      // http://a@b/c@d => host:b auth:a path:/c@d
	      atSign = rest.lastIndexOf('@', hostEnd);
	    }

	    // Now we have a portion which is definitely the auth.
	    // Pull that off.
	    if (atSign !== -1) {
	      auth = rest.slice(0, atSign);
	      rest = rest.slice(atSign + 1);
	      self.auth = decodeURIComponent(auth);
	    }

	    // the host is the remaining to the left of the first non-host char
	    hostEnd = -1;
	    for (i = 0; i < nonHostChars.length; i++) {
	      hec = rest.indexOf(nonHostChars[i]);
	      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
	        hostEnd = hec;
	    }
	    // if we still have not hit it, then the entire thing is a host.
	    if (hostEnd === -1)
	      hostEnd = rest.length;

	    self.host = rest.slice(0, hostEnd);
	    rest = rest.slice(hostEnd);

	    // pull out port.
	    parseHost(self);

	    // we've indicated that there is a hostname,
	    // so even if it's empty, it has to be present.
	    self.hostname = self.hostname || '';

	    // if hostname begins with [ and ends with ]
	    // assume that it's an IPv6 address.
	    var ipv6Hostname = self.hostname[0] === '[' &&
	      self.hostname[self.hostname.length - 1] === ']';

	    // validate a little.
	    if (!ipv6Hostname) {
	      var hostparts = self.hostname.split(/\./);
	      for (i = 0, l = hostparts.length; i < l; i++) {
	        var part = hostparts[i];
	        if (!part) continue;
	        if (!part.match(hostnamePartPattern)) {
	          var newpart = '';
	          for (var j = 0, k = part.length; j < k; j++) {
	            if (part.charCodeAt(j) > 127) {
	              // we replace non-ASCII char with a temporary placeholder
	              // we need this to make sure size of hostname is not
	              // broken by replacing non-ASCII by nothing
	              newpart += 'x';
	            } else {
	              newpart += part[j];
	            }
	          }
	          // we test again with ASCII char only
	          if (!newpart.match(hostnamePartPattern)) {
	            var validParts = hostparts.slice(0, i);
	            var notHost = hostparts.slice(i + 1);
	            var bit = part.match(hostnamePartStart);
	            if (bit) {
	              validParts.push(bit[1]);
	              notHost.unshift(bit[2]);
	            }
	            if (notHost.length) {
	              rest = '/' + notHost.join('.') + rest;
	            }
	            self.hostname = validParts.join('.');
	            break;
	          }
	        }
	      }
	    }

	    if (self.hostname.length > hostnameMaxLen) {
	      self.hostname = '';
	    } else {
	      // hostnames are always lower case.
	      self.hostname = self.hostname.toLowerCase();
	    }

	    if (!ipv6Hostname) {
	      // IDNA Support: Returns a punycoded representation of "domain".
	      // It only converts parts of the domain name that
	      // have non-ASCII characters, i.e. it doesn't matter if
	      // you call it with a domain that already is ASCII-only.
	      self.hostname = toASCII(self.hostname);
	    }

	    p = self.port ? ':' + self.port : '';
	    var h = self.hostname || '';
	    self.host = h + p;
	    self.href += self.host;

	    // strip [ and ] from the hostname
	    // the host field still retains them, though
	    if (ipv6Hostname) {
	      self.hostname = self.hostname.substr(1, self.hostname.length - 2);
	      if (rest[0] !== '/') {
	        rest = '/' + rest;
	      }
	    }
	  }

	  // now rest is set to the post-host stuff.
	  // chop off any delim chars.
	  if (!unsafeProtocol[lowerProto]) {

	    // First, make 100% sure that any "autoEscape" chars get
	    // escaped, even if encodeURIComponent doesn't think they
	    // need to be.
	    for (i = 0, l = autoEscape.length; i < l; i++) {
	      var ae = autoEscape[i];
	      if (rest.indexOf(ae) === -1)
	        continue;
	      var esc = encodeURIComponent(ae);
	      if (esc === ae) {
	        esc = escape(ae);
	      }
	      rest = rest.split(ae).join(esc);
	    }
	  }


	  // chop off from the tail first.
	  var hash = rest.indexOf('#');
	  if (hash !== -1) {
	    // got a fragment string.
	    self.hash = rest.substr(hash);
	    rest = rest.slice(0, hash);
	  }
	  var qm = rest.indexOf('?');
	  if (qm !== -1) {
	    self.search = rest.substr(qm);
	    self.query = rest.substr(qm + 1);
	    if (parseQueryString) {
	      self.query = parse$1(self.query);
	    }
	    rest = rest.slice(0, qm);
	  } else if (parseQueryString) {
	    // no query string, but parseQueryString still requested
	    self.search = '';
	    self.query = {};
	  }
	  if (rest) self.pathname = rest;
	  if (slashedProtocol[lowerProto] &&
	    self.hostname && !self.pathname) {
	    self.pathname = '/';
	  }

	  //to support http.request
	  if (self.pathname || self.search) {
	    p = self.pathname || '';
	    var s = self.search || '';
	    self.path = p + s;
	  }

	  // finally, reconstruct the href based on what has been validated.
	  self.href = format$1(self);
	  return self;
	}

	// format a parsed object into a url string
	function urlFormat(obj) {
	  // ensure it's an object, and not a string url.
	  // If it's an obj, this is a no-op.
	  // this way, you can call url_format() on strings
	  // to clean up potentially wonky urls.
	  if (isString(obj)) obj = parse$2({}, obj);
	  return format$1(obj);
	}

	function format$1(self) {
	  var auth = self.auth || '';
	  if (auth) {
	    auth = encodeURIComponent(auth);
	    auth = auth.replace(/%3A/i, ':');
	    auth += '@';
	  }

	  var protocol = self.protocol || '',
	    pathname = self.pathname || '',
	    hash = self.hash || '',
	    host = false,
	    query = '';

	  if (self.host) {
	    host = auth + self.host;
	  } else if (self.hostname) {
	    host = auth + (self.hostname.indexOf(':') === -1 ?
	      self.hostname :
	      '[' + this.hostname + ']');
	    if (self.port) {
	      host += ':' + self.port;
	    }
	  }

	  if (self.query &&
	    isObject$1(self.query) &&
	    Object.keys(self.query).length) {
	    query = stringify(self.query);
	  }

	  var search = self.search || (query && ('?' + query)) || '';

	  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

	  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
	  // unless they had them to begin with.
	  if (self.slashes ||
	    (!protocol || slashedProtocol[protocol]) && host !== false) {
	    host = '//' + (host || '');
	    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
	  } else if (!host) {
	    host = '';
	  }

	  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
	  if (search && search.charAt(0) !== '?') search = '?' + search;

	  pathname = pathname.replace(/[?#]/g, function(match) {
	    return encodeURIComponent(match);
	  });
	  search = search.replace('#', '%23');

	  return protocol + host + pathname + search + hash;
	}

	Url.prototype.format = function() {
	  return format$1(this);
	};

	function urlResolve(source, relative) {
	  return urlParse(source, false, true).resolve(relative);
	}

	Url.prototype.resolve = function(relative) {
	  return this.resolveObject(urlParse(relative, false, true)).format();
	};

	function urlResolveObject(source, relative) {
	  if (!source) return relative;
	  return urlParse(source, false, true).resolveObject(relative);
	}

	Url.prototype.resolveObject = function(relative) {
	  if (isString(relative)) {
	    var rel = new Url();
	    rel.parse(relative, false, true);
	    relative = rel;
	  }

	  var result = new Url();
	  var tkeys = Object.keys(this);
	  for (var tk = 0; tk < tkeys.length; tk++) {
	    var tkey = tkeys[tk];
	    result[tkey] = this[tkey];
	  }

	  // hash is always overridden, no matter what.
	  // even href="" will remove it.
	  result.hash = relative.hash;

	  // if the relative url is empty, then there's nothing left to do here.
	  if (relative.href === '') {
	    result.href = result.format();
	    return result;
	  }

	  // hrefs like //foo/bar always cut to the protocol.
	  if (relative.slashes && !relative.protocol) {
	    // take everything except the protocol from relative
	    var rkeys = Object.keys(relative);
	    for (var rk = 0; rk < rkeys.length; rk++) {
	      var rkey = rkeys[rk];
	      if (rkey !== 'protocol')
	        result[rkey] = relative[rkey];
	    }

	    //urlParse appends trailing / to urls like http://www.example.com
	    if (slashedProtocol[result.protocol] &&
	      result.hostname && !result.pathname) {
	      result.path = result.pathname = '/';
	    }

	    result.href = result.format();
	    return result;
	  }
	  var relPath;
	  if (relative.protocol && relative.protocol !== result.protocol) {
	    // if it's a known url protocol, then changing
	    // the protocol does weird things
	    // first, if it's not file:, then we MUST have a host,
	    // and if there was a path
	    // to begin with, then we MUST have a path.
	    // if it is file:, then the host is dropped,
	    // because that's known to be hostless.
	    // anything else is assumed to be absolute.
	    if (!slashedProtocol[relative.protocol]) {
	      var keys = Object.keys(relative);
	      for (var v = 0; v < keys.length; v++) {
	        var k = keys[v];
	        result[k] = relative[k];
	      }
	      result.href = result.format();
	      return result;
	    }

	    result.protocol = relative.protocol;
	    if (!relative.host && !hostlessProtocol[relative.protocol]) {
	      relPath = (relative.pathname || '').split('/');
	      while (relPath.length && !(relative.host = relPath.shift()));
	      if (!relative.host) relative.host = '';
	      if (!relative.hostname) relative.hostname = '';
	      if (relPath[0] !== '') relPath.unshift('');
	      if (relPath.length < 2) relPath.unshift('');
	      result.pathname = relPath.join('/');
	    } else {
	      result.pathname = relative.pathname;
	    }
	    result.search = relative.search;
	    result.query = relative.query;
	    result.host = relative.host || '';
	    result.auth = relative.auth;
	    result.hostname = relative.hostname || relative.host;
	    result.port = relative.port;
	    // to support http.request
	    if (result.pathname || result.search) {
	      var p = result.pathname || '';
	      var s = result.search || '';
	      result.path = p + s;
	    }
	    result.slashes = result.slashes || relative.slashes;
	    result.href = result.format();
	    return result;
	  }

	  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
	    isRelAbs = (
	      relative.host ||
	      relative.pathname && relative.pathname.charAt(0) === '/'
	    ),
	    mustEndAbs = (isRelAbs || isSourceAbs ||
	      (result.host && relative.pathname)),
	    removeAllDots = mustEndAbs,
	    srcPath = result.pathname && result.pathname.split('/') || [],
	    psychotic = result.protocol && !slashedProtocol[result.protocol];
	  relPath = relative.pathname && relative.pathname.split('/') || [];
	  // if the url is a non-slashed url, then relative
	  // links like ../.. should be able
	  // to crawl up to the hostname, as well.  This is strange.
	  // result.protocol has already been set by now.
	  // Later on, put the first path part into the host field.
	  if (psychotic) {
	    result.hostname = '';
	    result.port = null;
	    if (result.host) {
	      if (srcPath[0] === '') srcPath[0] = result.host;
	      else srcPath.unshift(result.host);
	    }
	    result.host = '';
	    if (relative.protocol) {
	      relative.hostname = null;
	      relative.port = null;
	      if (relative.host) {
	        if (relPath[0] === '') relPath[0] = relative.host;
	        else relPath.unshift(relative.host);
	      }
	      relative.host = null;
	    }
	    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
	  }
	  var authInHost;
	  if (isRelAbs) {
	    // it's absolute.
	    result.host = (relative.host || relative.host === '') ?
	      relative.host : result.host;
	    result.hostname = (relative.hostname || relative.hostname === '') ?
	      relative.hostname : result.hostname;
	    result.search = relative.search;
	    result.query = relative.query;
	    srcPath = relPath;
	    // fall through to the dot-handling below.
	  } else if (relPath.length) {
	    // it's relative
	    // throw away the existing file, and take the new path instead.
	    if (!srcPath) srcPath = [];
	    srcPath.pop();
	    srcPath = srcPath.concat(relPath);
	    result.search = relative.search;
	    result.query = relative.query;
	  } else if (!isNullOrUndefined(relative.search)) {
	    // just pull out the search.
	    // like href='?foo'.
	    // Put this after the other two cases because it simplifies the booleans
	    if (psychotic) {
	      result.hostname = result.host = srcPath.shift();
	      //occationaly the auth can get stuck only in host
	      //this especially happens in cases like
	      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
	      authInHost = result.host && result.host.indexOf('@') > 0 ?
	        result.host.split('@') : false;
	      if (authInHost) {
	        result.auth = authInHost.shift();
	        result.host = result.hostname = authInHost.shift();
	      }
	    }
	    result.search = relative.search;
	    result.query = relative.query;
	    //to support http.request
	    if (!isNull(result.pathname) || !isNull(result.search)) {
	      result.path = (result.pathname ? result.pathname : '') +
	        (result.search ? result.search : '');
	    }
	    result.href = result.format();
	    return result;
	  }

	  if (!srcPath.length) {
	    // no path at all.  easy.
	    // we've already handled the other stuff above.
	    result.pathname = null;
	    //to support http.request
	    if (result.search) {
	      result.path = '/' + result.search;
	    } else {
	      result.path = null;
	    }
	    result.href = result.format();
	    return result;
	  }

	  // if a url ENDs in . or .., then it must get a trailing slash.
	  // however, if it ends in anything else non-slashy,
	  // then it must NOT get a trailing slash.
	  var last = srcPath.slice(-1)[0];
	  var hasTrailingSlash = (
	    (result.host || relative.host || srcPath.length > 1) &&
	    (last === '.' || last === '..') || last === '');

	  // strip single dots, resolve double dots to parent dir
	  // if the path tries to go above the root, `up` ends up > 0
	  var up = 0;
	  for (var i = srcPath.length; i >= 0; i--) {
	    last = srcPath[i];
	    if (last === '.') {
	      srcPath.splice(i, 1);
	    } else if (last === '..') {
	      srcPath.splice(i, 1);
	      up++;
	    } else if (up) {
	      srcPath.splice(i, 1);
	      up--;
	    }
	  }

	  // if the path is allowed to go above the root, restore leading ..s
	  if (!mustEndAbs && !removeAllDots) {
	    for (; up--; up) {
	      srcPath.unshift('..');
	    }
	  }

	  if (mustEndAbs && srcPath[0] !== '' &&
	    (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
	    srcPath.unshift('');
	  }

	  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
	    srcPath.push('');
	  }

	  var isAbsolute = srcPath[0] === '' ||
	    (srcPath[0] && srcPath[0].charAt(0) === '/');

	  // put the host back
	  if (psychotic) {
	    result.hostname = result.host = isAbsolute ? '' :
	      srcPath.length ? srcPath.shift() : '';
	    //occationaly the auth can get stuck only in host
	    //this especially happens in cases like
	    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
	    authInHost = result.host && result.host.indexOf('@') > 0 ?
	      result.host.split('@') : false;
	    if (authInHost) {
	      result.auth = authInHost.shift();
	      result.host = result.hostname = authInHost.shift();
	    }
	  }

	  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

	  if (mustEndAbs && !isAbsolute) {
	    srcPath.unshift('');
	  }

	  if (!srcPath.length) {
	    result.pathname = null;
	    result.path = null;
	  } else {
	    result.pathname = srcPath.join('/');
	  }

	  //to support request.http
	  if (!isNull(result.pathname) || !isNull(result.search)) {
	    result.path = (result.pathname ? result.pathname : '') +
	      (result.search ? result.search : '');
	  }
	  result.auth = relative.auth || result.auth;
	  result.slashes = result.slashes || relative.slashes;
	  result.href = result.format();
	  return result;
	};

	Url.prototype.parseHost = function() {
	  return parseHost(this);
	};

	function parseHost(self) {
	  var host = self.host;
	  var port = portPattern.exec(host);
	  if (port) {
	    port = port[0];
	    if (port !== ':') {
	      self.port = port.substr(1);
	    }
	    host = host.substr(0, host.length - port.length);
	  }
	  if (host) self.hostname = host;
	}

	var url$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		parse: urlParse,
		resolve: urlResolve,
		resolveObject: urlResolveObject,
		format: urlFormat,
		'default': url,
		Url: Url
	});

	var url_1 = /*@__PURE__*/getAugmentedNamespace(url$1);

	var URL = url_1.URL;
	var URLSearchParams = url_1.URLSearchParams;


	var url$2 = /*#__PURE__*/Object.defineProperty({
		URL: URL,
		URLSearchParams: URLSearchParams
	}, '__esModule', {value: true});

	var fetch$1 = createCommonjsModule(function (module, exports) {
	function __export(m) {
	    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
	}
	Object.defineProperty(exports, "__esModule", { value: true });
	__export(fetch);
	__export(url$2);

	});

	var isNodeLike_1 = typeof process === "object" &&
	    process &&
	    process.release &&
	    process.versions &&
	    typeof process.versions.node === "string";


	var isNodeLike = /*#__PURE__*/Object.defineProperty({
		isNodeLike: isNodeLike_1
	}, '__esModule', {value: true});

	var empty = {};

	var empty$1 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		'default': empty
	});

	var inherits_browser = createCommonjsModule(function (module) {
	if (typeof Object.create === 'function') {
	  // implementation from standard node.js 'util' module
	  module.exports = function inherits(ctor, superCtor) {
	    if (superCtor) {
	      ctor.super_ = superCtor;
	      ctor.prototype = Object.create(superCtor.prototype, {
	        constructor: {
	          value: ctor,
	          enumerable: false,
	          writable: true,
	          configurable: true
	        }
	      });
	    }
	  };
	} else {
	  // old school shim for old browsers
	  module.exports = function inherits(ctor, superCtor) {
	    if (superCtor) {
	      ctor.super_ = superCtor;
	      var TempCtor = function () {};
	      TempCtor.prototype = superCtor.prototype;
	      ctor.prototype = new TempCtor();
	      ctor.prototype.constructor = ctor;
	    }
	  };
	}
	});

	var util_1 = /*@__PURE__*/getAugmentedNamespace(util$1);

	var inherits$2 = createCommonjsModule(function (module) {
	try {
	  var util = util_1;
	  /* istanbul ignore next */
	  if (typeof util.inherits !== 'function') throw '';
	  module.exports = util.inherits;
	} catch (e) {
	  /* istanbul ignore next */
	  module.exports = inherits_browser;
	}
	});

	var lookup = [];
	var revLookup = [];
	var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
	var inited = false;
	function init () {
	  inited = true;
	  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	  for (var i = 0, len = code.length; i < len; ++i) {
	    lookup[i] = code[i];
	    revLookup[code.charCodeAt(i)] = i;
	  }

	  revLookup['-'.charCodeAt(0)] = 62;
	  revLookup['_'.charCodeAt(0)] = 63;
	}

	function toByteArray (b64) {
	  if (!inited) {
	    init();
	  }
	  var i, j, l, tmp, placeHolders, arr;
	  var len = b64.length;

	  if (len % 4 > 0) {
	    throw new Error('Invalid string. Length must be a multiple of 4')
	  }

	  // the number of equal signs (place holders)
	  // if there are two placeholders, than the two characters before it
	  // represent one byte
	  // if there is only one, then the three characters before it represent 2 bytes
	  // this is just a cheap hack to not do indexOf twice
	  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

	  // base64 is 4/3 + up to two characters of the original data
	  arr = new Arr(len * 3 / 4 - placeHolders);

	  // if there are placeholders, only get up to the last complete 4 chars
	  l = placeHolders > 0 ? len - 4 : len;

	  var L = 0;

	  for (i = 0, j = 0; i < l; i += 4, j += 3) {
	    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
	    arr[L++] = (tmp >> 16) & 0xFF;
	    arr[L++] = (tmp >> 8) & 0xFF;
	    arr[L++] = tmp & 0xFF;
	  }

	  if (placeHolders === 2) {
	    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
	    arr[L++] = tmp & 0xFF;
	  } else if (placeHolders === 1) {
	    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
	    arr[L++] = (tmp >> 8) & 0xFF;
	    arr[L++] = tmp & 0xFF;
	  }

	  return arr
	}

	function tripletToBase64 (num) {
	  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
	}

	function encodeChunk (uint8, start, end) {
	  var tmp;
	  var output = [];
	  for (var i = start; i < end; i += 3) {
	    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
	    output.push(tripletToBase64(tmp));
	  }
	  return output.join('')
	}

	function fromByteArray (uint8) {
	  if (!inited) {
	    init();
	  }
	  var tmp;
	  var len = uint8.length;
	  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
	  var output = '';
	  var parts = [];
	  var maxChunkLength = 16383; // must be multiple of 3

	  // go through the array every three bytes, we'll deal with trailing stuff later
	  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
	    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
	  }

	  // pad the end with zeros, but make sure to not forget the extra bytes
	  if (extraBytes === 1) {
	    tmp = uint8[len - 1];
	    output += lookup[tmp >> 2];
	    output += lookup[(tmp << 4) & 0x3F];
	    output += '==';
	  } else if (extraBytes === 2) {
	    tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
	    output += lookup[tmp >> 10];
	    output += lookup[(tmp >> 4) & 0x3F];
	    output += lookup[(tmp << 2) & 0x3F];
	    output += '=';
	  }

	  parts.push(output);

	  return parts.join('')
	}

	function read (buffer, offset, isLE, mLen, nBytes) {
	  var e, m;
	  var eLen = nBytes * 8 - mLen - 1;
	  var eMax = (1 << eLen) - 1;
	  var eBias = eMax >> 1;
	  var nBits = -7;
	  var i = isLE ? (nBytes - 1) : 0;
	  var d = isLE ? -1 : 1;
	  var s = buffer[offset + i];

	  i += d;

	  e = s & ((1 << (-nBits)) - 1);
	  s >>= (-nBits);
	  nBits += eLen;
	  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

	  m = e & ((1 << (-nBits)) - 1);
	  e >>= (-nBits);
	  nBits += mLen;
	  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

	  if (e === 0) {
	    e = 1 - eBias;
	  } else if (e === eMax) {
	    return m ? NaN : ((s ? -1 : 1) * Infinity)
	  } else {
	    m = m + Math.pow(2, mLen);
	    e = e - eBias;
	  }
	  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
	}

	function write (buffer, value, offset, isLE, mLen, nBytes) {
	  var e, m, c;
	  var eLen = nBytes * 8 - mLen - 1;
	  var eMax = (1 << eLen) - 1;
	  var eBias = eMax >> 1;
	  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
	  var i = isLE ? 0 : (nBytes - 1);
	  var d = isLE ? 1 : -1;
	  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

	  value = Math.abs(value);

	  if (isNaN(value) || value === Infinity) {
	    m = isNaN(value) ? 1 : 0;
	    e = eMax;
	  } else {
	    e = Math.floor(Math.log(value) / Math.LN2);
	    if (value * (c = Math.pow(2, -e)) < 1) {
	      e--;
	      c *= 2;
	    }
	    if (e + eBias >= 1) {
	      value += rt / c;
	    } else {
	      value += rt * Math.pow(2, 1 - eBias);
	    }
	    if (value * c >= 2) {
	      e++;
	      c /= 2;
	    }

	    if (e + eBias >= eMax) {
	      m = 0;
	      e = eMax;
	    } else if (e + eBias >= 1) {
	      m = (value * c - 1) * Math.pow(2, mLen);
	      e = e + eBias;
	    } else {
	      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
	      e = 0;
	    }
	  }

	  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

	  e = (e << mLen) | m;
	  eLen += mLen;
	  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

	  buffer[offset + i - d] |= s * 128;
	}

	var toString$1 = {}.toString;

	var isArray$3 = Array.isArray || function (arr) {
	  return toString$1.call(arr) == '[object Array]';
	};

	/*!
	 * The buffer module from node.js, for the browser.
	 *
	 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
	 * @license  MIT
	 */

	var INSPECT_MAX_BYTES = 50;

	/**
	 * If `Buffer.TYPED_ARRAY_SUPPORT`:
	 *   === true    Use Uint8Array implementation (fastest)
	 *   === false   Use Object implementation (most compatible, even IE6)
	 *
	 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
	 * Opera 11.6+, iOS 4.2+.
	 *
	 * Due to various browser bugs, sometimes the Object implementation will be used even
	 * when the browser supports typed arrays.
	 *
	 * Note:
	 *
	 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
	 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
	 *
	 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
	 *
	 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
	 *     incorrect length in some situations.

	 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
	 * get the Object implementation, which is slower but behaves correctly.
	 */
	Buffer$1.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
	  ? global.TYPED_ARRAY_SUPPORT
	  : true;

	/*
	 * Export kMaxLength after typed array support is determined.
	 */
	var _kMaxLength = kMaxLength();

	function kMaxLength () {
	  return Buffer$1.TYPED_ARRAY_SUPPORT
	    ? 0x7fffffff
	    : 0x3fffffff
	}

	function createBuffer (that, length) {
	  if (kMaxLength() < length) {
	    throw new RangeError('Invalid typed array length')
	  }
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    // Return an augmented `Uint8Array` instance, for best performance
	    that = new Uint8Array(length);
	    that.__proto__ = Buffer$1.prototype;
	  } else {
	    // Fallback: Return an object instance of the Buffer class
	    if (that === null) {
	      that = new Buffer$1(length);
	    }
	    that.length = length;
	  }

	  return that
	}

	/**
	 * The Buffer constructor returns instances of `Uint8Array` that have their
	 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
	 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
	 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
	 * returns a single octet.
	 *
	 * The `Uint8Array` prototype remains unmodified.
	 */

	function Buffer$1 (arg, encodingOrOffset, length) {
	  if (!Buffer$1.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer$1)) {
	    return new Buffer$1(arg, encodingOrOffset, length)
	  }

	  // Common case.
	  if (typeof arg === 'number') {
	    if (typeof encodingOrOffset === 'string') {
	      throw new Error(
	        'If encoding is specified then the first argument must be a string'
	      )
	    }
	    return allocUnsafe(this, arg)
	  }
	  return from(this, arg, encodingOrOffset, length)
	}

	Buffer$1.poolSize = 8192; // not used by this implementation

	// TODO: Legacy, not needed anymore. Remove in next major version.
	Buffer$1._augment = function (arr) {
	  arr.__proto__ = Buffer$1.prototype;
	  return arr
	};

	function from (that, value, encodingOrOffset, length) {
	  if (typeof value === 'number') {
	    throw new TypeError('"value" argument must not be a number')
	  }

	  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
	    return fromArrayBuffer(that, value, encodingOrOffset, length)
	  }

	  if (typeof value === 'string') {
	    return fromString(that, value, encodingOrOffset)
	  }

	  return fromObject(that, value)
	}

	/**
	 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
	 * if value is a number.
	 * Buffer.from(str[, encoding])
	 * Buffer.from(array)
	 * Buffer.from(buffer)
	 * Buffer.from(arrayBuffer[, byteOffset[, length]])
	 **/
	Buffer$1.from = function (value, encodingOrOffset, length) {
	  return from(null, value, encodingOrOffset, length)
	};

	if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	  Buffer$1.prototype.__proto__ = Uint8Array.prototype;
	  Buffer$1.__proto__ = Uint8Array;
	}

	function assertSize (size) {
	  if (typeof size !== 'number') {
	    throw new TypeError('"size" argument must be a number')
	  } else if (size < 0) {
	    throw new RangeError('"size" argument must not be negative')
	  }
	}

	function alloc (that, size, fill, encoding) {
	  assertSize(size);
	  if (size <= 0) {
	    return createBuffer(that, size)
	  }
	  if (fill !== undefined) {
	    // Only pay attention to encoding if it's a string. This
	    // prevents accidentally sending in a number that would
	    // be interpretted as a start offset.
	    return typeof encoding === 'string'
	      ? createBuffer(that, size).fill(fill, encoding)
	      : createBuffer(that, size).fill(fill)
	  }
	  return createBuffer(that, size)
	}

	/**
	 * Creates a new filled Buffer instance.
	 * alloc(size[, fill[, encoding]])
	 **/
	Buffer$1.alloc = function (size, fill, encoding) {
	  return alloc(null, size, fill, encoding)
	};

	function allocUnsafe (that, size) {
	  assertSize(size);
	  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
	  if (!Buffer$1.TYPED_ARRAY_SUPPORT) {
	    for (var i = 0; i < size; ++i) {
	      that[i] = 0;
	    }
	  }
	  return that
	}

	/**
	 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
	 * */
	Buffer$1.allocUnsafe = function (size) {
	  return allocUnsafe(null, size)
	};
	/**
	 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
	 */
	Buffer$1.allocUnsafeSlow = function (size) {
	  return allocUnsafe(null, size)
	};

	function fromString (that, string, encoding) {
	  if (typeof encoding !== 'string' || encoding === '') {
	    encoding = 'utf8';
	  }

	  if (!Buffer$1.isEncoding(encoding)) {
	    throw new TypeError('"encoding" must be a valid string encoding')
	  }

	  var length = byteLength(string, encoding) | 0;
	  that = createBuffer(that, length);

	  var actual = that.write(string, encoding);

	  if (actual !== length) {
	    // Writing a hex string, for example, that contains invalid characters will
	    // cause everything after the first invalid character to be ignored. (e.g.
	    // 'abxxcd' will be treated as 'ab')
	    that = that.slice(0, actual);
	  }

	  return that
	}

	function fromArrayLike (that, array) {
	  var length = array.length < 0 ? 0 : checked(array.length) | 0;
	  that = createBuffer(that, length);
	  for (var i = 0; i < length; i += 1) {
	    that[i] = array[i] & 255;
	  }
	  return that
	}

	function fromArrayBuffer (that, array, byteOffset, length) {
	  array.byteLength; // this throws if `array` is not a valid ArrayBuffer

	  if (byteOffset < 0 || array.byteLength < byteOffset) {
	    throw new RangeError('\'offset\' is out of bounds')
	  }

	  if (array.byteLength < byteOffset + (length || 0)) {
	    throw new RangeError('\'length\' is out of bounds')
	  }

	  if (byteOffset === undefined && length === undefined) {
	    array = new Uint8Array(array);
	  } else if (length === undefined) {
	    array = new Uint8Array(array, byteOffset);
	  } else {
	    array = new Uint8Array(array, byteOffset, length);
	  }

	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    // Return an augmented `Uint8Array` instance, for best performance
	    that = array;
	    that.__proto__ = Buffer$1.prototype;
	  } else {
	    // Fallback: Return an object instance of the Buffer class
	    that = fromArrayLike(that, array);
	  }
	  return that
	}

	function fromObject (that, obj) {
	  if (internalIsBuffer(obj)) {
	    var len = checked(obj.length) | 0;
	    that = createBuffer(that, len);

	    if (that.length === 0) {
	      return that
	    }

	    obj.copy(that, 0, 0, len);
	    return that
	  }

	  if (obj) {
	    if ((typeof ArrayBuffer !== 'undefined' &&
	        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
	      if (typeof obj.length !== 'number' || isnan(obj.length)) {
	        return createBuffer(that, 0)
	      }
	      return fromArrayLike(that, obj)
	    }

	    if (obj.type === 'Buffer' && isArray$3(obj.data)) {
	      return fromArrayLike(that, obj.data)
	    }
	  }

	  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
	}

	function checked (length) {
	  // Note: cannot use `length < kMaxLength()` here because that fails when
	  // length is NaN (which is otherwise coerced to zero.)
	  if (length >= kMaxLength()) {
	    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
	                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
	  }
	  return length | 0
	}

	function SlowBuffer (length) {
	  if (+length != length) { // eslint-disable-line eqeqeq
	    length = 0;
	  }
	  return Buffer$1.alloc(+length)
	}
	Buffer$1.isBuffer = isBuffer$1;
	function internalIsBuffer (b) {
	  return !!(b != null && b._isBuffer)
	}

	Buffer$1.compare = function compare (a, b) {
	  if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
	    throw new TypeError('Arguments must be Buffers')
	  }

	  if (a === b) return 0

	  var x = a.length;
	  var y = b.length;

	  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
	    if (a[i] !== b[i]) {
	      x = a[i];
	      y = b[i];
	      break
	    }
	  }

	  if (x < y) return -1
	  if (y < x) return 1
	  return 0
	};

	Buffer$1.isEncoding = function isEncoding (encoding) {
	  switch (String(encoding).toLowerCase()) {
	    case 'hex':
	    case 'utf8':
	    case 'utf-8':
	    case 'ascii':
	    case 'latin1':
	    case 'binary':
	    case 'base64':
	    case 'ucs2':
	    case 'ucs-2':
	    case 'utf16le':
	    case 'utf-16le':
	      return true
	    default:
	      return false
	  }
	};

	Buffer$1.concat = function concat (list, length) {
	  if (!isArray$3(list)) {
	    throw new TypeError('"list" argument must be an Array of Buffers')
	  }

	  if (list.length === 0) {
	    return Buffer$1.alloc(0)
	  }

	  var i;
	  if (length === undefined) {
	    length = 0;
	    for (i = 0; i < list.length; ++i) {
	      length += list[i].length;
	    }
	  }

	  var buffer = Buffer$1.allocUnsafe(length);
	  var pos = 0;
	  for (i = 0; i < list.length; ++i) {
	    var buf = list[i];
	    if (!internalIsBuffer(buf)) {
	      throw new TypeError('"list" argument must be an Array of Buffers')
	    }
	    buf.copy(buffer, pos);
	    pos += buf.length;
	  }
	  return buffer
	};

	function byteLength (string, encoding) {
	  if (internalIsBuffer(string)) {
	    return string.length
	  }
	  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
	      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
	    return string.byteLength
	  }
	  if (typeof string !== 'string') {
	    string = '' + string;
	  }

	  var len = string.length;
	  if (len === 0) return 0

	  // Use a for loop to avoid recursion
	  var loweredCase = false;
	  for (;;) {
	    switch (encoding) {
	      case 'ascii':
	      case 'latin1':
	      case 'binary':
	        return len
	      case 'utf8':
	      case 'utf-8':
	      case undefined:
	        return utf8ToBytes(string).length
	      case 'ucs2':
	      case 'ucs-2':
	      case 'utf16le':
	      case 'utf-16le':
	        return len * 2
	      case 'hex':
	        return len >>> 1
	      case 'base64':
	        return base64ToBytes(string).length
	      default:
	        if (loweredCase) return utf8ToBytes(string).length // assume utf8
	        encoding = ('' + encoding).toLowerCase();
	        loweredCase = true;
	    }
	  }
	}
	Buffer$1.byteLength = byteLength;

	function slowToString (encoding, start, end) {
	  var loweredCase = false;

	  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
	  // property of a typed array.

	  // This behaves neither like String nor Uint8Array in that we set start/end
	  // to their upper/lower bounds if the value passed is out of range.
	  // undefined is handled specially as per ECMA-262 6th Edition,
	  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
	  if (start === undefined || start < 0) {
	    start = 0;
	  }
	  // Return early if start > this.length. Done here to prevent potential uint32
	  // coercion fail below.
	  if (start > this.length) {
	    return ''
	  }

	  if (end === undefined || end > this.length) {
	    end = this.length;
	  }

	  if (end <= 0) {
	    return ''
	  }

	  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
	  end >>>= 0;
	  start >>>= 0;

	  if (end <= start) {
	    return ''
	  }

	  if (!encoding) encoding = 'utf8';

	  while (true) {
	    switch (encoding) {
	      case 'hex':
	        return hexSlice(this, start, end)

	      case 'utf8':
	      case 'utf-8':
	        return utf8Slice(this, start, end)

	      case 'ascii':
	        return asciiSlice(this, start, end)

	      case 'latin1':
	      case 'binary':
	        return latin1Slice(this, start, end)

	      case 'base64':
	        return base64Slice(this, start, end)

	      case 'ucs2':
	      case 'ucs-2':
	      case 'utf16le':
	      case 'utf-16le':
	        return utf16leSlice(this, start, end)

	      default:
	        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
	        encoding = (encoding + '').toLowerCase();
	        loweredCase = true;
	    }
	  }
	}

	// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
	// Buffer instances.
	Buffer$1.prototype._isBuffer = true;

	function swap (b, n, m) {
	  var i = b[n];
	  b[n] = b[m];
	  b[m] = i;
	}

	Buffer$1.prototype.swap16 = function swap16 () {
	  var len = this.length;
	  if (len % 2 !== 0) {
	    throw new RangeError('Buffer size must be a multiple of 16-bits')
	  }
	  for (var i = 0; i < len; i += 2) {
	    swap(this, i, i + 1);
	  }
	  return this
	};

	Buffer$1.prototype.swap32 = function swap32 () {
	  var len = this.length;
	  if (len % 4 !== 0) {
	    throw new RangeError('Buffer size must be a multiple of 32-bits')
	  }
	  for (var i = 0; i < len; i += 4) {
	    swap(this, i, i + 3);
	    swap(this, i + 1, i + 2);
	  }
	  return this
	};

	Buffer$1.prototype.swap64 = function swap64 () {
	  var len = this.length;
	  if (len % 8 !== 0) {
	    throw new RangeError('Buffer size must be a multiple of 64-bits')
	  }
	  for (var i = 0; i < len; i += 8) {
	    swap(this, i, i + 7);
	    swap(this, i + 1, i + 6);
	    swap(this, i + 2, i + 5);
	    swap(this, i + 3, i + 4);
	  }
	  return this
	};

	Buffer$1.prototype.toString = function toString () {
	  var length = this.length | 0;
	  if (length === 0) return ''
	  if (arguments.length === 0) return utf8Slice(this, 0, length)
	  return slowToString.apply(this, arguments)
	};

	Buffer$1.prototype.equals = function equals (b) {
	  if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
	  if (this === b) return true
	  return Buffer$1.compare(this, b) === 0
	};

	Buffer$1.prototype.inspect = function inspect () {
	  var str = '';
	  var max = INSPECT_MAX_BYTES;
	  if (this.length > 0) {
	    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
	    if (this.length > max) str += ' ... ';
	  }
	  return '<Buffer ' + str + '>'
	};

	Buffer$1.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
	  if (!internalIsBuffer(target)) {
	    throw new TypeError('Argument must be a Buffer')
	  }

	  if (start === undefined) {
	    start = 0;
	  }
	  if (end === undefined) {
	    end = target ? target.length : 0;
	  }
	  if (thisStart === undefined) {
	    thisStart = 0;
	  }
	  if (thisEnd === undefined) {
	    thisEnd = this.length;
	  }

	  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
	    throw new RangeError('out of range index')
	  }

	  if (thisStart >= thisEnd && start >= end) {
	    return 0
	  }
	  if (thisStart >= thisEnd) {
	    return -1
	  }
	  if (start >= end) {
	    return 1
	  }

	  start >>>= 0;
	  end >>>= 0;
	  thisStart >>>= 0;
	  thisEnd >>>= 0;

	  if (this === target) return 0

	  var x = thisEnd - thisStart;
	  var y = end - start;
	  var len = Math.min(x, y);

	  var thisCopy = this.slice(thisStart, thisEnd);
	  var targetCopy = target.slice(start, end);

	  for (var i = 0; i < len; ++i) {
	    if (thisCopy[i] !== targetCopy[i]) {
	      x = thisCopy[i];
	      y = targetCopy[i];
	      break
	    }
	  }

	  if (x < y) return -1
	  if (y < x) return 1
	  return 0
	};

	// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
	// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
	//
	// Arguments:
	// - buffer - a Buffer to search
	// - val - a string, Buffer, or number
	// - byteOffset - an index into `buffer`; will be clamped to an int32
	// - encoding - an optional encoding, relevant is val is a string
	// - dir - true for indexOf, false for lastIndexOf
	function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
	  // Empty buffer means no match
	  if (buffer.length === 0) return -1

	  // Normalize byteOffset
	  if (typeof byteOffset === 'string') {
	    encoding = byteOffset;
	    byteOffset = 0;
	  } else if (byteOffset > 0x7fffffff) {
	    byteOffset = 0x7fffffff;
	  } else if (byteOffset < -0x80000000) {
	    byteOffset = -0x80000000;
	  }
	  byteOffset = +byteOffset;  // Coerce to Number.
	  if (isNaN(byteOffset)) {
	    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
	    byteOffset = dir ? 0 : (buffer.length - 1);
	  }

	  // Normalize byteOffset: negative offsets start from the end of the buffer
	  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
	  if (byteOffset >= buffer.length) {
	    if (dir) return -1
	    else byteOffset = buffer.length - 1;
	  } else if (byteOffset < 0) {
	    if (dir) byteOffset = 0;
	    else return -1
	  }

	  // Normalize val
	  if (typeof val === 'string') {
	    val = Buffer$1.from(val, encoding);
	  }

	  // Finally, search either indexOf (if dir is true) or lastIndexOf
	  if (internalIsBuffer(val)) {
	    // Special case: looking for empty string/buffer always fails
	    if (val.length === 0) {
	      return -1
	    }
	    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
	  } else if (typeof val === 'number') {
	    val = val & 0xFF; // Search for a byte value [0-255]
	    if (Buffer$1.TYPED_ARRAY_SUPPORT &&
	        typeof Uint8Array.prototype.indexOf === 'function') {
	      if (dir) {
	        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
	      } else {
	        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
	      }
	    }
	    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
	  }

	  throw new TypeError('val must be string, number or Buffer')
	}

	function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
	  var indexSize = 1;
	  var arrLength = arr.length;
	  var valLength = val.length;

	  if (encoding !== undefined) {
	    encoding = String(encoding).toLowerCase();
	    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
	        encoding === 'utf16le' || encoding === 'utf-16le') {
	      if (arr.length < 2 || val.length < 2) {
	        return -1
	      }
	      indexSize = 2;
	      arrLength /= 2;
	      valLength /= 2;
	      byteOffset /= 2;
	    }
	  }

	  function read (buf, i) {
	    if (indexSize === 1) {
	      return buf[i]
	    } else {
	      return buf.readUInt16BE(i * indexSize)
	    }
	  }

	  var i;
	  if (dir) {
	    var foundIndex = -1;
	    for (i = byteOffset; i < arrLength; i++) {
	      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
	        if (foundIndex === -1) foundIndex = i;
	        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
	      } else {
	        if (foundIndex !== -1) i -= i - foundIndex;
	        foundIndex = -1;
	      }
	    }
	  } else {
	    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
	    for (i = byteOffset; i >= 0; i--) {
	      var found = true;
	      for (var j = 0; j < valLength; j++) {
	        if (read(arr, i + j) !== read(val, j)) {
	          found = false;
	          break
	        }
	      }
	      if (found) return i
	    }
	  }

	  return -1
	}

	Buffer$1.prototype.includes = function includes (val, byteOffset, encoding) {
	  return this.indexOf(val, byteOffset, encoding) !== -1
	};

	Buffer$1.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
	  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
	};

	Buffer$1.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
	  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
	};

	function hexWrite (buf, string, offset, length) {
	  offset = Number(offset) || 0;
	  var remaining = buf.length - offset;
	  if (!length) {
	    length = remaining;
	  } else {
	    length = Number(length);
	    if (length > remaining) {
	      length = remaining;
	    }
	  }

	  // must be an even number of digits
	  var strLen = string.length;
	  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

	  if (length > strLen / 2) {
	    length = strLen / 2;
	  }
	  for (var i = 0; i < length; ++i) {
	    var parsed = parseInt(string.substr(i * 2, 2), 16);
	    if (isNaN(parsed)) return i
	    buf[offset + i] = parsed;
	  }
	  return i
	}

	function utf8Write (buf, string, offset, length) {
	  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
	}

	function asciiWrite (buf, string, offset, length) {
	  return blitBuffer(asciiToBytes(string), buf, offset, length)
	}

	function latin1Write (buf, string, offset, length) {
	  return asciiWrite(buf, string, offset, length)
	}

	function base64Write (buf, string, offset, length) {
	  return blitBuffer(base64ToBytes(string), buf, offset, length)
	}

	function ucs2Write (buf, string, offset, length) {
	  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
	}

	Buffer$1.prototype.write = function write (string, offset, length, encoding) {
	  // Buffer#write(string)
	  if (offset === undefined) {
	    encoding = 'utf8';
	    length = this.length;
	    offset = 0;
	  // Buffer#write(string, encoding)
	  } else if (length === undefined && typeof offset === 'string') {
	    encoding = offset;
	    length = this.length;
	    offset = 0;
	  // Buffer#write(string, offset[, length][, encoding])
	  } else if (isFinite(offset)) {
	    offset = offset | 0;
	    if (isFinite(length)) {
	      length = length | 0;
	      if (encoding === undefined) encoding = 'utf8';
	    } else {
	      encoding = length;
	      length = undefined;
	    }
	  // legacy write(string, encoding, offset, length) - remove in v0.13
	  } else {
	    throw new Error(
	      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
	    )
	  }

	  var remaining = this.length - offset;
	  if (length === undefined || length > remaining) length = remaining;

	  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
	    throw new RangeError('Attempt to write outside buffer bounds')
	  }

	  if (!encoding) encoding = 'utf8';

	  var loweredCase = false;
	  for (;;) {
	    switch (encoding) {
	      case 'hex':
	        return hexWrite(this, string, offset, length)

	      case 'utf8':
	      case 'utf-8':
	        return utf8Write(this, string, offset, length)

	      case 'ascii':
	        return asciiWrite(this, string, offset, length)

	      case 'latin1':
	      case 'binary':
	        return latin1Write(this, string, offset, length)

	      case 'base64':
	        // Warning: maxLength not taken into account in base64Write
	        return base64Write(this, string, offset, length)

	      case 'ucs2':
	      case 'ucs-2':
	      case 'utf16le':
	      case 'utf-16le':
	        return ucs2Write(this, string, offset, length)

	      default:
	        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
	        encoding = ('' + encoding).toLowerCase();
	        loweredCase = true;
	    }
	  }
	};

	Buffer$1.prototype.toJSON = function toJSON () {
	  return {
	    type: 'Buffer',
	    data: Array.prototype.slice.call(this._arr || this, 0)
	  }
	};

	function base64Slice (buf, start, end) {
	  if (start === 0 && end === buf.length) {
	    return fromByteArray(buf)
	  } else {
	    return fromByteArray(buf.slice(start, end))
	  }
	}

	function utf8Slice (buf, start, end) {
	  end = Math.min(buf.length, end);
	  var res = [];

	  var i = start;
	  while (i < end) {
	    var firstByte = buf[i];
	    var codePoint = null;
	    var bytesPerSequence = (firstByte > 0xEF) ? 4
	      : (firstByte > 0xDF) ? 3
	      : (firstByte > 0xBF) ? 2
	      : 1;

	    if (i + bytesPerSequence <= end) {
	      var secondByte, thirdByte, fourthByte, tempCodePoint;

	      switch (bytesPerSequence) {
	        case 1:
	          if (firstByte < 0x80) {
	            codePoint = firstByte;
	          }
	          break
	        case 2:
	          secondByte = buf[i + 1];
	          if ((secondByte & 0xC0) === 0x80) {
	            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
	            if (tempCodePoint > 0x7F) {
	              codePoint = tempCodePoint;
	            }
	          }
	          break
	        case 3:
	          secondByte = buf[i + 1];
	          thirdByte = buf[i + 2];
	          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
	            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
	            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
	              codePoint = tempCodePoint;
	            }
	          }
	          break
	        case 4:
	          secondByte = buf[i + 1];
	          thirdByte = buf[i + 2];
	          fourthByte = buf[i + 3];
	          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
	            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
	            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
	              codePoint = tempCodePoint;
	            }
	          }
	      }
	    }

	    if (codePoint === null) {
	      // we did not generate a valid codePoint so insert a
	      // replacement char (U+FFFD) and advance only 1 byte
	      codePoint = 0xFFFD;
	      bytesPerSequence = 1;
	    } else if (codePoint > 0xFFFF) {
	      // encode to utf16 (surrogate pair dance)
	      codePoint -= 0x10000;
	      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
	      codePoint = 0xDC00 | codePoint & 0x3FF;
	    }

	    res.push(codePoint);
	    i += bytesPerSequence;
	  }

	  return decodeCodePointsArray(res)
	}

	// Based on http://stackoverflow.com/a/22747272/680742, the browser with
	// the lowest limit is Chrome, with 0x10000 args.
	// We go 1 magnitude less, for safety
	var MAX_ARGUMENTS_LENGTH = 0x1000;

	function decodeCodePointsArray (codePoints) {
	  var len = codePoints.length;
	  if (len <= MAX_ARGUMENTS_LENGTH) {
	    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
	  }

	  // Decode in chunks to avoid "call stack size exceeded".
	  var res = '';
	  var i = 0;
	  while (i < len) {
	    res += String.fromCharCode.apply(
	      String,
	      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
	    );
	  }
	  return res
	}

	function asciiSlice (buf, start, end) {
	  var ret = '';
	  end = Math.min(buf.length, end);

	  for (var i = start; i < end; ++i) {
	    ret += String.fromCharCode(buf[i] & 0x7F);
	  }
	  return ret
	}

	function latin1Slice (buf, start, end) {
	  var ret = '';
	  end = Math.min(buf.length, end);

	  for (var i = start; i < end; ++i) {
	    ret += String.fromCharCode(buf[i]);
	  }
	  return ret
	}

	function hexSlice (buf, start, end) {
	  var len = buf.length;

	  if (!start || start < 0) start = 0;
	  if (!end || end < 0 || end > len) end = len;

	  var out = '';
	  for (var i = start; i < end; ++i) {
	    out += toHex(buf[i]);
	  }
	  return out
	}

	function utf16leSlice (buf, start, end) {
	  var bytes = buf.slice(start, end);
	  var res = '';
	  for (var i = 0; i < bytes.length; i += 2) {
	    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
	  }
	  return res
	}

	Buffer$1.prototype.slice = function slice (start, end) {
	  var len = this.length;
	  start = ~~start;
	  end = end === undefined ? len : ~~end;

	  if (start < 0) {
	    start += len;
	    if (start < 0) start = 0;
	  } else if (start > len) {
	    start = len;
	  }

	  if (end < 0) {
	    end += len;
	    if (end < 0) end = 0;
	  } else if (end > len) {
	    end = len;
	  }

	  if (end < start) end = start;

	  var newBuf;
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    newBuf = this.subarray(start, end);
	    newBuf.__proto__ = Buffer$1.prototype;
	  } else {
	    var sliceLen = end - start;
	    newBuf = new Buffer$1(sliceLen, undefined);
	    for (var i = 0; i < sliceLen; ++i) {
	      newBuf[i] = this[i + start];
	    }
	  }

	  return newBuf
	};

	/*
	 * Need to make sure that buffer isn't trying to write out of bounds.
	 */
	function checkOffset (offset, ext, length) {
	  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
	  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
	}

	Buffer$1.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
	  offset = offset | 0;
	  byteLength = byteLength | 0;
	  if (!noAssert) checkOffset(offset, byteLength, this.length);

	  var val = this[offset];
	  var mul = 1;
	  var i = 0;
	  while (++i < byteLength && (mul *= 0x100)) {
	    val += this[offset + i] * mul;
	  }

	  return val
	};

	Buffer$1.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
	  offset = offset | 0;
	  byteLength = byteLength | 0;
	  if (!noAssert) {
	    checkOffset(offset, byteLength, this.length);
	  }

	  var val = this[offset + --byteLength];
	  var mul = 1;
	  while (byteLength > 0 && (mul *= 0x100)) {
	    val += this[offset + --byteLength] * mul;
	  }

	  return val
	};

	Buffer$1.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 1, this.length);
	  return this[offset]
	};

	Buffer$1.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 2, this.length);
	  return this[offset] | (this[offset + 1] << 8)
	};

	Buffer$1.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 2, this.length);
	  return (this[offset] << 8) | this[offset + 1]
	};

	Buffer$1.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 4, this.length);

	  return ((this[offset]) |
	      (this[offset + 1] << 8) |
	      (this[offset + 2] << 16)) +
	      (this[offset + 3] * 0x1000000)
	};

	Buffer$1.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 4, this.length);

	  return (this[offset] * 0x1000000) +
	    ((this[offset + 1] << 16) |
	    (this[offset + 2] << 8) |
	    this[offset + 3])
	};

	Buffer$1.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
	  offset = offset | 0;
	  byteLength = byteLength | 0;
	  if (!noAssert) checkOffset(offset, byteLength, this.length);

	  var val = this[offset];
	  var mul = 1;
	  var i = 0;
	  while (++i < byteLength && (mul *= 0x100)) {
	    val += this[offset + i] * mul;
	  }
	  mul *= 0x80;

	  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

	  return val
	};

	Buffer$1.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
	  offset = offset | 0;
	  byteLength = byteLength | 0;
	  if (!noAssert) checkOffset(offset, byteLength, this.length);

	  var i = byteLength;
	  var mul = 1;
	  var val = this[offset + --i];
	  while (i > 0 && (mul *= 0x100)) {
	    val += this[offset + --i] * mul;
	  }
	  mul *= 0x80;

	  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

	  return val
	};

	Buffer$1.prototype.readInt8 = function readInt8 (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 1, this.length);
	  if (!(this[offset] & 0x80)) return (this[offset])
	  return ((0xff - this[offset] + 1) * -1)
	};

	Buffer$1.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 2, this.length);
	  var val = this[offset] | (this[offset + 1] << 8);
	  return (val & 0x8000) ? val | 0xFFFF0000 : val
	};

	Buffer$1.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 2, this.length);
	  var val = this[offset + 1] | (this[offset] << 8);
	  return (val & 0x8000) ? val | 0xFFFF0000 : val
	};

	Buffer$1.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 4, this.length);

	  return (this[offset]) |
	    (this[offset + 1] << 8) |
	    (this[offset + 2] << 16) |
	    (this[offset + 3] << 24)
	};

	Buffer$1.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 4, this.length);

	  return (this[offset] << 24) |
	    (this[offset + 1] << 16) |
	    (this[offset + 2] << 8) |
	    (this[offset + 3])
	};

	Buffer$1.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 4, this.length);
	  return read(this, offset, true, 23, 4)
	};

	Buffer$1.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 4, this.length);
	  return read(this, offset, false, 23, 4)
	};

	Buffer$1.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 8, this.length);
	  return read(this, offset, true, 52, 8)
	};

	Buffer$1.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
	  if (!noAssert) checkOffset(offset, 8, this.length);
	  return read(this, offset, false, 52, 8)
	};

	function checkInt (buf, value, offset, ext, max, min) {
	  if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
	  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
	  if (offset + ext > buf.length) throw new RangeError('Index out of range')
	}

	Buffer$1.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  byteLength = byteLength | 0;
	  if (!noAssert) {
	    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
	    checkInt(this, value, offset, byteLength, maxBytes, 0);
	  }

	  var mul = 1;
	  var i = 0;
	  this[offset] = value & 0xFF;
	  while (++i < byteLength && (mul *= 0x100)) {
	    this[offset + i] = (value / mul) & 0xFF;
	  }

	  return offset + byteLength
	};

	Buffer$1.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  byteLength = byteLength | 0;
	  if (!noAssert) {
	    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
	    checkInt(this, value, offset, byteLength, maxBytes, 0);
	  }

	  var i = byteLength - 1;
	  var mul = 1;
	  this[offset + i] = value & 0xFF;
	  while (--i >= 0 && (mul *= 0x100)) {
	    this[offset + i] = (value / mul) & 0xFF;
	  }

	  return offset + byteLength
	};

	Buffer$1.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
	  if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
	  this[offset] = (value & 0xff);
	  return offset + 1
	};

	function objectWriteUInt16 (buf, value, offset, littleEndian) {
	  if (value < 0) value = 0xffff + value + 1;
	  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
	    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
	      (littleEndian ? i : 1 - i) * 8;
	  }
	}

	Buffer$1.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    this[offset] = (value & 0xff);
	    this[offset + 1] = (value >>> 8);
	  } else {
	    objectWriteUInt16(this, value, offset, true);
	  }
	  return offset + 2
	};

	Buffer$1.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    this[offset] = (value >>> 8);
	    this[offset + 1] = (value & 0xff);
	  } else {
	    objectWriteUInt16(this, value, offset, false);
	  }
	  return offset + 2
	};

	function objectWriteUInt32 (buf, value, offset, littleEndian) {
	  if (value < 0) value = 0xffffffff + value + 1;
	  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
	    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
	  }
	}

	Buffer$1.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    this[offset + 3] = (value >>> 24);
	    this[offset + 2] = (value >>> 16);
	    this[offset + 1] = (value >>> 8);
	    this[offset] = (value & 0xff);
	  } else {
	    objectWriteUInt32(this, value, offset, true);
	  }
	  return offset + 4
	};

	Buffer$1.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    this[offset] = (value >>> 24);
	    this[offset + 1] = (value >>> 16);
	    this[offset + 2] = (value >>> 8);
	    this[offset + 3] = (value & 0xff);
	  } else {
	    objectWriteUInt32(this, value, offset, false);
	  }
	  return offset + 4
	};

	Buffer$1.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) {
	    var limit = Math.pow(2, 8 * byteLength - 1);

	    checkInt(this, value, offset, byteLength, limit - 1, -limit);
	  }

	  var i = 0;
	  var mul = 1;
	  var sub = 0;
	  this[offset] = value & 0xFF;
	  while (++i < byteLength && (mul *= 0x100)) {
	    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
	      sub = 1;
	    }
	    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
	  }

	  return offset + byteLength
	};

	Buffer$1.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) {
	    var limit = Math.pow(2, 8 * byteLength - 1);

	    checkInt(this, value, offset, byteLength, limit - 1, -limit);
	  }

	  var i = byteLength - 1;
	  var mul = 1;
	  var sub = 0;
	  this[offset + i] = value & 0xFF;
	  while (--i >= 0 && (mul *= 0x100)) {
	    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
	      sub = 1;
	    }
	    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
	  }

	  return offset + byteLength
	};

	Buffer$1.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
	  if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
	  if (value < 0) value = 0xff + value + 1;
	  this[offset] = (value & 0xff);
	  return offset + 1
	};

	Buffer$1.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    this[offset] = (value & 0xff);
	    this[offset + 1] = (value >>> 8);
	  } else {
	    objectWriteUInt16(this, value, offset, true);
	  }
	  return offset + 2
	};

	Buffer$1.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    this[offset] = (value >>> 8);
	    this[offset + 1] = (value & 0xff);
	  } else {
	    objectWriteUInt16(this, value, offset, false);
	  }
	  return offset + 2
	};

	Buffer$1.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    this[offset] = (value & 0xff);
	    this[offset + 1] = (value >>> 8);
	    this[offset + 2] = (value >>> 16);
	    this[offset + 3] = (value >>> 24);
	  } else {
	    objectWriteUInt32(this, value, offset, true);
	  }
	  return offset + 4
	};

	Buffer$1.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
	  value = +value;
	  offset = offset | 0;
	  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
	  if (value < 0) value = 0xffffffff + value + 1;
	  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
	    this[offset] = (value >>> 24);
	    this[offset + 1] = (value >>> 16);
	    this[offset + 2] = (value >>> 8);
	    this[offset + 3] = (value & 0xff);
	  } else {
	    objectWriteUInt32(this, value, offset, false);
	  }
	  return offset + 4
	};

	function checkIEEE754 (buf, value, offset, ext, max, min) {
	  if (offset + ext > buf.length) throw new RangeError('Index out of range')
	  if (offset < 0) throw new RangeError('Index out of range')
	}

	function writeFloat (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    checkIEEE754(buf, value, offset, 4);
	  }
	  write(buf, value, offset, littleEndian, 23, 4);
	  return offset + 4
	}

	Buffer$1.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
	  return writeFloat(this, value, offset, true, noAssert)
	};

	Buffer$1.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
	  return writeFloat(this, value, offset, false, noAssert)
	};

	function writeDouble (buf, value, offset, littleEndian, noAssert) {
	  if (!noAssert) {
	    checkIEEE754(buf, value, offset, 8);
	  }
	  write(buf, value, offset, littleEndian, 52, 8);
	  return offset + 8
	}

	Buffer$1.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
	  return writeDouble(this, value, offset, true, noAssert)
	};

	Buffer$1.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
	  return writeDouble(this, value, offset, false, noAssert)
	};

	// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
	Buffer$1.prototype.copy = function copy (target, targetStart, start, end) {
	  if (!start) start = 0;
	  if (!end && end !== 0) end = this.length;
	  if (targetStart >= target.length) targetStart = target.length;
	  if (!targetStart) targetStart = 0;
	  if (end > 0 && end < start) end = start;

	  // Copy 0 bytes; we're done
	  if (end === start) return 0
	  if (target.length === 0 || this.length === 0) return 0

	  // Fatal error conditions
	  if (targetStart < 0) {
	    throw new RangeError('targetStart out of bounds')
	  }
	  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
	  if (end < 0) throw new RangeError('sourceEnd out of bounds')

	  // Are we oob?
	  if (end > this.length) end = this.length;
	  if (target.length - targetStart < end - start) {
	    end = target.length - targetStart + start;
	  }

	  var len = end - start;
	  var i;

	  if (this === target && start < targetStart && targetStart < end) {
	    // descending copy from end
	    for (i = len - 1; i >= 0; --i) {
	      target[i + targetStart] = this[i + start];
	    }
	  } else if (len < 1000 || !Buffer$1.TYPED_ARRAY_SUPPORT) {
	    // ascending copy from start
	    for (i = 0; i < len; ++i) {
	      target[i + targetStart] = this[i + start];
	    }
	  } else {
	    Uint8Array.prototype.set.call(
	      target,
	      this.subarray(start, start + len),
	      targetStart
	    );
	  }

	  return len
	};

	// Usage:
	//    buffer.fill(number[, offset[, end]])
	//    buffer.fill(buffer[, offset[, end]])
	//    buffer.fill(string[, offset[, end]][, encoding])
	Buffer$1.prototype.fill = function fill (val, start, end, encoding) {
	  // Handle string cases:
	  if (typeof val === 'string') {
	    if (typeof start === 'string') {
	      encoding = start;
	      start = 0;
	      end = this.length;
	    } else if (typeof end === 'string') {
	      encoding = end;
	      end = this.length;
	    }
	    if (val.length === 1) {
	      var code = val.charCodeAt(0);
	      if (code < 256) {
	        val = code;
	      }
	    }
	    if (encoding !== undefined && typeof encoding !== 'string') {
	      throw new TypeError('encoding must be a string')
	    }
	    if (typeof encoding === 'string' && !Buffer$1.isEncoding(encoding)) {
	      throw new TypeError('Unknown encoding: ' + encoding)
	    }
	  } else if (typeof val === 'number') {
	    val = val & 255;
	  }

	  // Invalid ranges are not set to a default, so can range check early.
	  if (start < 0 || this.length < start || this.length < end) {
	    throw new RangeError('Out of range index')
	  }

	  if (end <= start) {
	    return this
	  }

	  start = start >>> 0;
	  end = end === undefined ? this.length : end >>> 0;

	  if (!val) val = 0;

	  var i;
	  if (typeof val === 'number') {
	    for (i = start; i < end; ++i) {
	      this[i] = val;
	    }
	  } else {
	    var bytes = internalIsBuffer(val)
	      ? val
	      : utf8ToBytes(new Buffer$1(val, encoding).toString());
	    var len = bytes.length;
	    for (i = 0; i < end - start; ++i) {
	      this[i + start] = bytes[i % len];
	    }
	  }

	  return this
	};

	// HELPER FUNCTIONS
	// ================

	var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

	function base64clean (str) {
	  // Node strips out invalid characters like \n and \t from the string, base64-js does not
	  str = stringtrim(str).replace(INVALID_BASE64_RE, '');
	  // Node converts strings with length < 2 to ''
	  if (str.length < 2) return ''
	  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
	  while (str.length % 4 !== 0) {
	    str = str + '=';
	  }
	  return str
	}

	function stringtrim (str) {
	  if (str.trim) return str.trim()
	  return str.replace(/^\s+|\s+$/g, '')
	}

	function toHex (n) {
	  if (n < 16) return '0' + n.toString(16)
	  return n.toString(16)
	}

	function utf8ToBytes (string, units) {
	  units = units || Infinity;
	  var codePoint;
	  var length = string.length;
	  var leadSurrogate = null;
	  var bytes = [];

	  for (var i = 0; i < length; ++i) {
	    codePoint = string.charCodeAt(i);

	    // is surrogate component
	    if (codePoint > 0xD7FF && codePoint < 0xE000) {
	      // last char was a lead
	      if (!leadSurrogate) {
	        // no lead yet
	        if (codePoint > 0xDBFF) {
	          // unexpected trail
	          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
	          continue
	        } else if (i + 1 === length) {
	          // unpaired lead
	          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
	          continue
	        }

	        // valid lead
	        leadSurrogate = codePoint;

	        continue
	      }

	      // 2 leads in a row
	      if (codePoint < 0xDC00) {
	        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
	        leadSurrogate = codePoint;
	        continue
	      }

	      // valid surrogate pair
	      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
	    } else if (leadSurrogate) {
	      // valid bmp char, but last char was a lead
	      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
	    }

	    leadSurrogate = null;

	    // encode utf8
	    if (codePoint < 0x80) {
	      if ((units -= 1) < 0) break
	      bytes.push(codePoint);
	    } else if (codePoint < 0x800) {
	      if ((units -= 2) < 0) break
	      bytes.push(
	        codePoint >> 0x6 | 0xC0,
	        codePoint & 0x3F | 0x80
	      );
	    } else if (codePoint < 0x10000) {
	      if ((units -= 3) < 0) break
	      bytes.push(
	        codePoint >> 0xC | 0xE0,
	        codePoint >> 0x6 & 0x3F | 0x80,
	        codePoint & 0x3F | 0x80
	      );
	    } else if (codePoint < 0x110000) {
	      if ((units -= 4) < 0) break
	      bytes.push(
	        codePoint >> 0x12 | 0xF0,
	        codePoint >> 0xC & 0x3F | 0x80,
	        codePoint >> 0x6 & 0x3F | 0x80,
	        codePoint & 0x3F | 0x80
	      );
	    } else {
	      throw new Error('Invalid code point')
	    }
	  }

	  return bytes
	}

	function asciiToBytes (str) {
	  var byteArray = [];
	  for (var i = 0; i < str.length; ++i) {
	    // Node's code seems to be doing this and not & 0x7F..
	    byteArray.push(str.charCodeAt(i) & 0xFF);
	  }
	  return byteArray
	}

	function utf16leToBytes (str, units) {
	  var c, hi, lo;
	  var byteArray = [];
	  for (var i = 0; i < str.length; ++i) {
	    if ((units -= 2) < 0) break

	    c = str.charCodeAt(i);
	    hi = c >> 8;
	    lo = c % 256;
	    byteArray.push(lo);
	    byteArray.push(hi);
	  }

	  return byteArray
	}


	function base64ToBytes (str) {
	  return toByteArray(base64clean(str))
	}

	function blitBuffer (src, dst, offset, length) {
	  for (var i = 0; i < length; ++i) {
	    if ((i + offset >= dst.length) || (i >= src.length)) break
	    dst[i + offset] = src[i];
	  }
	  return i
	}

	function isnan (val) {
	  return val !== val // eslint-disable-line no-self-compare
	}


	// the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
	// The _isBuffer check is for Safari 5-7 support, because it's missing
	// Object.prototype.constructor. Remove this eventually
	function isBuffer$1(obj) {
	  return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
	}

	function isFastBuffer (obj) {
	  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
	}

	// For Node v0.10 support. Remove this eventually.
	function isSlowBuffer (obj) {
	  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
	}

	var bufferEs6 = /*#__PURE__*/Object.freeze({
		__proto__: null,
		Buffer: Buffer$1,
		INSPECT_MAX_BYTES: INSPECT_MAX_BYTES,
		SlowBuffer: SlowBuffer,
		isBuffer: isBuffer$1,
		kMaxLength: _kMaxLength
	});

	var buffer = /*@__PURE__*/getAugmentedNamespace(bufferEs6);

	/*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */

	var safeBuffer = createCommonjsModule(function (module, exports) {
	/* eslint-disable node/no-deprecated-api */

	var Buffer = buffer.Buffer;

	// alternative to using Object.keys for old browsers
	function copyProps (src, dst) {
	  for (var key in src) {
	    dst[key] = src[key];
	  }
	}
	if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
	  module.exports = buffer;
	} else {
	  // Copy properties from require('buffer')
	  copyProps(buffer, exports);
	  exports.Buffer = SafeBuffer;
	}

	function SafeBuffer (arg, encodingOrOffset, length) {
	  return Buffer(arg, encodingOrOffset, length)
	}

	SafeBuffer.prototype = Object.create(Buffer.prototype);

	// Copy static methods from Buffer
	copyProps(Buffer, SafeBuffer);

	SafeBuffer.from = function (arg, encodingOrOffset, length) {
	  if (typeof arg === 'number') {
	    throw new TypeError('Argument must not be a number')
	  }
	  return Buffer(arg, encodingOrOffset, length)
	};

	SafeBuffer.alloc = function (size, fill, encoding) {
	  if (typeof size !== 'number') {
	    throw new TypeError('Argument must be a number')
	  }
	  var buf = Buffer(size);
	  if (fill !== undefined) {
	    if (typeof encoding === 'string') {
	      buf.fill(fill, encoding);
	    } else {
	      buf.fill(fill);
	    }
	  } else {
	    buf.fill(0);
	  }
	  return buf
	};

	SafeBuffer.allocUnsafe = function (size) {
	  if (typeof size !== 'number') {
	    throw new TypeError('Argument must be a number')
	  }
	  return Buffer(size)
	};

	SafeBuffer.allocUnsafeSlow = function (size) {
	  if (typeof size !== 'number') {
	    throw new TypeError('Argument must be a number')
	  }
	  return buffer.SlowBuffer(size)
	};
	});

	var Buffer$2 = safeBuffer.Buffer;

	// prototype class for hash functions
	function Hash (blockSize, finalSize) {
	  this._block = Buffer$2.alloc(blockSize);
	  this._finalSize = finalSize;
	  this._blockSize = blockSize;
	  this._len = 0;
	}

	Hash.prototype.update = function (data, enc) {
	  if (typeof data === 'string') {
	    enc = enc || 'utf8';
	    data = Buffer$2.from(data, enc);
	  }

	  var block = this._block;
	  var blockSize = this._blockSize;
	  var length = data.length;
	  var accum = this._len;

	  for (var offset = 0; offset < length;) {
	    var assigned = accum % blockSize;
	    var remainder = Math.min(length - offset, blockSize - assigned);

	    for (var i = 0; i < remainder; i++) {
	      block[assigned + i] = data[offset + i];
	    }

	    accum += remainder;
	    offset += remainder;

	    if ((accum % blockSize) === 0) {
	      this._update(block);
	    }
	  }

	  this._len += length;
	  return this
	};

	Hash.prototype.digest = function (enc) {
	  var rem = this._len % this._blockSize;

	  this._block[rem] = 0x80;

	  // zero (rem + 1) trailing bits, where (rem + 1) is the smallest
	  // non-negative solution to the equation (length + 1 + (rem + 1)) === finalSize mod blockSize
	  this._block.fill(0, rem + 1);

	  if (rem >= this._finalSize) {
	    this._update(this._block);
	    this._block.fill(0);
	  }

	  var bits = this._len * 8;

	  // uint32
	  if (bits <= 0xffffffff) {
	    this._block.writeUInt32BE(bits, this._blockSize - 4);

	  // uint64
	  } else {
	    var lowBits = (bits & 0xffffffff) >>> 0;
	    var highBits = (bits - lowBits) / 0x100000000;

	    this._block.writeUInt32BE(highBits, this._blockSize - 8);
	    this._block.writeUInt32BE(lowBits, this._blockSize - 4);
	  }

	  this._update(this._block);
	  var hash = this._hash();

	  return enc ? hash.toString(enc) : hash
	};

	Hash.prototype._update = function () {
	  throw new Error('_update must be implemented by subclass')
	};

	var hash = Hash;

	/*
	 * A JavaScript implementation of the Secure Hash Algorithm, SHA-0, as defined
	 * in FIPS PUB 180-1
	 * This source code is derived from sha1.js of the same repository.
	 * The difference between SHA-0 and SHA-1 is just a bitwise rotate left
	 * operation was added.
	 */

	var Buffer$3 = safeBuffer.Buffer;

	var K = [
	  0x5a827999, 0x6ed9eba1, 0x8f1bbcdc | 0, 0xca62c1d6 | 0
	];

	var W = new Array(80);

	function Sha () {
	  this.init();
	  this._w = W;

	  hash.call(this, 64, 56);
	}

	inherits$2(Sha, hash);

	Sha.prototype.init = function () {
	  this._a = 0x67452301;
	  this._b = 0xefcdab89;
	  this._c = 0x98badcfe;
	  this._d = 0x10325476;
	  this._e = 0xc3d2e1f0;

	  return this
	};

	function rotl5 (num) {
	  return (num << 5) | (num >>> 27)
	}

	function rotl30 (num) {
	  return (num << 30) | (num >>> 2)
	}

	function ft (s, b, c, d) {
	  if (s === 0) return (b & c) | ((~b) & d)
	  if (s === 2) return (b & c) | (b & d) | (c & d)
	  return b ^ c ^ d
	}

	Sha.prototype._update = function (M) {
	  var W = this._w;

	  var a = this._a | 0;
	  var b = this._b | 0;
	  var c = this._c | 0;
	  var d = this._d | 0;
	  var e = this._e | 0;

	  for (var i = 0; i < 16; ++i) W[i] = M.readInt32BE(i * 4);
	  for (; i < 80; ++i) W[i] = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];

	  for (var j = 0; j < 80; ++j) {
	    var s = ~~(j / 20);
	    var t = (rotl5(a) + ft(s, b, c, d) + e + W[j] + K[s]) | 0;

	    e = d;
	    d = c;
	    c = rotl30(b);
	    b = a;
	    a = t;
	  }

	  this._a = (a + this._a) | 0;
	  this._b = (b + this._b) | 0;
	  this._c = (c + this._c) | 0;
	  this._d = (d + this._d) | 0;
	  this._e = (e + this._e) | 0;
	};

	Sha.prototype._hash = function () {
	  var H = Buffer$3.allocUnsafe(20);

	  H.writeInt32BE(this._a | 0, 0);
	  H.writeInt32BE(this._b | 0, 4);
	  H.writeInt32BE(this._c | 0, 8);
	  H.writeInt32BE(this._d | 0, 12);
	  H.writeInt32BE(this._e | 0, 16);

	  return H
	};

	var sha = Sha;

	/*
	 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
	 * in FIPS PUB 180-1
	 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
	 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
	 * Distributed under the BSD License
	 * See http://pajhome.org.uk/crypt/md5 for details.
	 */

	var Buffer$4 = safeBuffer.Buffer;

	var K$1 = [
	  0x5a827999, 0x6ed9eba1, 0x8f1bbcdc | 0, 0xca62c1d6 | 0
	];

	var W$1 = new Array(80);

	function Sha1 () {
	  this.init();
	  this._w = W$1;

	  hash.call(this, 64, 56);
	}

	inherits$2(Sha1, hash);

	Sha1.prototype.init = function () {
	  this._a = 0x67452301;
	  this._b = 0xefcdab89;
	  this._c = 0x98badcfe;
	  this._d = 0x10325476;
	  this._e = 0xc3d2e1f0;

	  return this
	};

	function rotl1 (num) {
	  return (num << 1) | (num >>> 31)
	}

	function rotl5$1 (num) {
	  return (num << 5) | (num >>> 27)
	}

	function rotl30$1 (num) {
	  return (num << 30) | (num >>> 2)
	}

	function ft$1 (s, b, c, d) {
	  if (s === 0) return (b & c) | ((~b) & d)
	  if (s === 2) return (b & c) | (b & d) | (c & d)
	  return b ^ c ^ d
	}

	Sha1.prototype._update = function (M) {
	  var W = this._w;

	  var a = this._a | 0;
	  var b = this._b | 0;
	  var c = this._c | 0;
	  var d = this._d | 0;
	  var e = this._e | 0;

	  for (var i = 0; i < 16; ++i) W[i] = M.readInt32BE(i * 4);
	  for (; i < 80; ++i) W[i] = rotl1(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16]);

	  for (var j = 0; j < 80; ++j) {
	    var s = ~~(j / 20);
	    var t = (rotl5$1(a) + ft$1(s, b, c, d) + e + W[j] + K$1[s]) | 0;

	    e = d;
	    d = c;
	    c = rotl30$1(b);
	    b = a;
	    a = t;
	  }

	  this._a = (a + this._a) | 0;
	  this._b = (b + this._b) | 0;
	  this._c = (c + this._c) | 0;
	  this._d = (d + this._d) | 0;
	  this._e = (e + this._e) | 0;
	};

	Sha1.prototype._hash = function () {
	  var H = Buffer$4.allocUnsafe(20);

	  H.writeInt32BE(this._a | 0, 0);
	  H.writeInt32BE(this._b | 0, 4);
	  H.writeInt32BE(this._c | 0, 8);
	  H.writeInt32BE(this._d | 0, 12);
	  H.writeInt32BE(this._e | 0, 16);

	  return H
	};

	var sha1 = Sha1;

	/**
	 * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
	 * in FIPS 180-2
	 * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
	 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
	 *
	 */

	var Buffer$5 = safeBuffer.Buffer;

	var K$2 = [
	  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5,
	  0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
	  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
	  0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
	  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC,
	  0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
	  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7,
	  0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
	  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13,
	  0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
	  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3,
	  0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
	  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5,
	  0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
	  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208,
	  0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
	];

	var W$2 = new Array(64);

	function Sha256 () {
	  this.init();

	  this._w = W$2; // new Array(64)

	  hash.call(this, 64, 56);
	}

	inherits$2(Sha256, hash);

	Sha256.prototype.init = function () {
	  this._a = 0x6a09e667;
	  this._b = 0xbb67ae85;
	  this._c = 0x3c6ef372;
	  this._d = 0xa54ff53a;
	  this._e = 0x510e527f;
	  this._f = 0x9b05688c;
	  this._g = 0x1f83d9ab;
	  this._h = 0x5be0cd19;

	  return this
	};

	function ch (x, y, z) {
	  return z ^ (x & (y ^ z))
	}

	function maj (x, y, z) {
	  return (x & y) | (z & (x | y))
	}

	function sigma0 (x) {
	  return (x >>> 2 | x << 30) ^ (x >>> 13 | x << 19) ^ (x >>> 22 | x << 10)
	}

	function sigma1 (x) {
	  return (x >>> 6 | x << 26) ^ (x >>> 11 | x << 21) ^ (x >>> 25 | x << 7)
	}

	function gamma0 (x) {
	  return (x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ (x >>> 3)
	}

	function gamma1 (x) {
	  return (x >>> 17 | x << 15) ^ (x >>> 19 | x << 13) ^ (x >>> 10)
	}

	Sha256.prototype._update = function (M) {
	  var W = this._w;

	  var a = this._a | 0;
	  var b = this._b | 0;
	  var c = this._c | 0;
	  var d = this._d | 0;
	  var e = this._e | 0;
	  var f = this._f | 0;
	  var g = this._g | 0;
	  var h = this._h | 0;

	  for (var i = 0; i < 16; ++i) W[i] = M.readInt32BE(i * 4);
	  for (; i < 64; ++i) W[i] = (gamma1(W[i - 2]) + W[i - 7] + gamma0(W[i - 15]) + W[i - 16]) | 0;

	  for (var j = 0; j < 64; ++j) {
	    var T1 = (h + sigma1(e) + ch(e, f, g) + K$2[j] + W[j]) | 0;
	    var T2 = (sigma0(a) + maj(a, b, c)) | 0;

	    h = g;
	    g = f;
	    f = e;
	    e = (d + T1) | 0;
	    d = c;
	    c = b;
	    b = a;
	    a = (T1 + T2) | 0;
	  }

	  this._a = (a + this._a) | 0;
	  this._b = (b + this._b) | 0;
	  this._c = (c + this._c) | 0;
	  this._d = (d + this._d) | 0;
	  this._e = (e + this._e) | 0;
	  this._f = (f + this._f) | 0;
	  this._g = (g + this._g) | 0;
	  this._h = (h + this._h) | 0;
	};

	Sha256.prototype._hash = function () {
	  var H = Buffer$5.allocUnsafe(32);

	  H.writeInt32BE(this._a, 0);
	  H.writeInt32BE(this._b, 4);
	  H.writeInt32BE(this._c, 8);
	  H.writeInt32BE(this._d, 12);
	  H.writeInt32BE(this._e, 16);
	  H.writeInt32BE(this._f, 20);
	  H.writeInt32BE(this._g, 24);
	  H.writeInt32BE(this._h, 28);

	  return H
	};

	var sha256 = Sha256;

	/**
	 * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
	 * in FIPS 180-2
	 * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
	 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
	 *
	 */

	var Buffer$6 = safeBuffer.Buffer;

	var W$3 = new Array(64);

	function Sha224 () {
	  this.init();

	  this._w = W$3; // new Array(64)

	  hash.call(this, 64, 56);
	}

	inherits$2(Sha224, sha256);

	Sha224.prototype.init = function () {
	  this._a = 0xc1059ed8;
	  this._b = 0x367cd507;
	  this._c = 0x3070dd17;
	  this._d = 0xf70e5939;
	  this._e = 0xffc00b31;
	  this._f = 0x68581511;
	  this._g = 0x64f98fa7;
	  this._h = 0xbefa4fa4;

	  return this
	};

	Sha224.prototype._hash = function () {
	  var H = Buffer$6.allocUnsafe(28);

	  H.writeInt32BE(this._a, 0);
	  H.writeInt32BE(this._b, 4);
	  H.writeInt32BE(this._c, 8);
	  H.writeInt32BE(this._d, 12);
	  H.writeInt32BE(this._e, 16);
	  H.writeInt32BE(this._f, 20);
	  H.writeInt32BE(this._g, 24);

	  return H
	};

	var sha224 = Sha224;

	var Buffer$7 = safeBuffer.Buffer;

	var K$3 = [
	  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd,
	  0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
	  0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
	  0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
	  0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe,
	  0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
	  0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1,
	  0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
	  0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
	  0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
	  0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483,
	  0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
	  0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210,
	  0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
	  0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
	  0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
	  0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926,
	  0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
	  0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8,
	  0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
	  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
	  0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
	  0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910,
	  0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
	  0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53,
	  0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
	  0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
	  0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
	  0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60,
	  0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
	  0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9,
	  0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
	  0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
	  0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
	  0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6,
	  0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
	  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493,
	  0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
	  0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
	  0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
	];

	var W$4 = new Array(160);

	function Sha512 () {
	  this.init();
	  this._w = W$4;

	  hash.call(this, 128, 112);
	}

	inherits$2(Sha512, hash);

	Sha512.prototype.init = function () {
	  this._ah = 0x6a09e667;
	  this._bh = 0xbb67ae85;
	  this._ch = 0x3c6ef372;
	  this._dh = 0xa54ff53a;
	  this._eh = 0x510e527f;
	  this._fh = 0x9b05688c;
	  this._gh = 0x1f83d9ab;
	  this._hh = 0x5be0cd19;

	  this._al = 0xf3bcc908;
	  this._bl = 0x84caa73b;
	  this._cl = 0xfe94f82b;
	  this._dl = 0x5f1d36f1;
	  this._el = 0xade682d1;
	  this._fl = 0x2b3e6c1f;
	  this._gl = 0xfb41bd6b;
	  this._hl = 0x137e2179;

	  return this
	};

	function Ch (x, y, z) {
	  return z ^ (x & (y ^ z))
	}

	function maj$1 (x, y, z) {
	  return (x & y) | (z & (x | y))
	}

	function sigma0$1 (x, xl) {
	  return (x >>> 28 | xl << 4) ^ (xl >>> 2 | x << 30) ^ (xl >>> 7 | x << 25)
	}

	function sigma1$1 (x, xl) {
	  return (x >>> 14 | xl << 18) ^ (x >>> 18 | xl << 14) ^ (xl >>> 9 | x << 23)
	}

	function Gamma0 (x, xl) {
	  return (x >>> 1 | xl << 31) ^ (x >>> 8 | xl << 24) ^ (x >>> 7)
	}

	function Gamma0l (x, xl) {
	  return (x >>> 1 | xl << 31) ^ (x >>> 8 | xl << 24) ^ (x >>> 7 | xl << 25)
	}

	function Gamma1 (x, xl) {
	  return (x >>> 19 | xl << 13) ^ (xl >>> 29 | x << 3) ^ (x >>> 6)
	}

	function Gamma1l (x, xl) {
	  return (x >>> 19 | xl << 13) ^ (xl >>> 29 | x << 3) ^ (x >>> 6 | xl << 26)
	}

	function getCarry (a, b) {
	  return (a >>> 0) < (b >>> 0) ? 1 : 0
	}

	Sha512.prototype._update = function (M) {
	  var W = this._w;

	  var ah = this._ah | 0;
	  var bh = this._bh | 0;
	  var ch = this._ch | 0;
	  var dh = this._dh | 0;
	  var eh = this._eh | 0;
	  var fh = this._fh | 0;
	  var gh = this._gh | 0;
	  var hh = this._hh | 0;

	  var al = this._al | 0;
	  var bl = this._bl | 0;
	  var cl = this._cl | 0;
	  var dl = this._dl | 0;
	  var el = this._el | 0;
	  var fl = this._fl | 0;
	  var gl = this._gl | 0;
	  var hl = this._hl | 0;

	  for (var i = 0; i < 32; i += 2) {
	    W[i] = M.readInt32BE(i * 4);
	    W[i + 1] = M.readInt32BE(i * 4 + 4);
	  }
	  for (; i < 160; i += 2) {
	    var xh = W[i - 15 * 2];
	    var xl = W[i - 15 * 2 + 1];
	    var gamma0 = Gamma0(xh, xl);
	    var gamma0l = Gamma0l(xl, xh);

	    xh = W[i - 2 * 2];
	    xl = W[i - 2 * 2 + 1];
	    var gamma1 = Gamma1(xh, xl);
	    var gamma1l = Gamma1l(xl, xh);

	    // W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16]
	    var Wi7h = W[i - 7 * 2];
	    var Wi7l = W[i - 7 * 2 + 1];

	    var Wi16h = W[i - 16 * 2];
	    var Wi16l = W[i - 16 * 2 + 1];

	    var Wil = (gamma0l + Wi7l) | 0;
	    var Wih = (gamma0 + Wi7h + getCarry(Wil, gamma0l)) | 0;
	    Wil = (Wil + gamma1l) | 0;
	    Wih = (Wih + gamma1 + getCarry(Wil, gamma1l)) | 0;
	    Wil = (Wil + Wi16l) | 0;
	    Wih = (Wih + Wi16h + getCarry(Wil, Wi16l)) | 0;

	    W[i] = Wih;
	    W[i + 1] = Wil;
	  }

	  for (var j = 0; j < 160; j += 2) {
	    Wih = W[j];
	    Wil = W[j + 1];

	    var majh = maj$1(ah, bh, ch);
	    var majl = maj$1(al, bl, cl);

	    var sigma0h = sigma0$1(ah, al);
	    var sigma0l = sigma0$1(al, ah);
	    var sigma1h = sigma1$1(eh, el);
	    var sigma1l = sigma1$1(el, eh);

	    // t1 = h + sigma1 + ch + K[j] + W[j]
	    var Kih = K$3[j];
	    var Kil = K$3[j + 1];

	    var chh = Ch(eh, fh, gh);
	    var chl = Ch(el, fl, gl);

	    var t1l = (hl + sigma1l) | 0;
	    var t1h = (hh + sigma1h + getCarry(t1l, hl)) | 0;
	    t1l = (t1l + chl) | 0;
	    t1h = (t1h + chh + getCarry(t1l, chl)) | 0;
	    t1l = (t1l + Kil) | 0;
	    t1h = (t1h + Kih + getCarry(t1l, Kil)) | 0;
	    t1l = (t1l + Wil) | 0;
	    t1h = (t1h + Wih + getCarry(t1l, Wil)) | 0;

	    // t2 = sigma0 + maj
	    var t2l = (sigma0l + majl) | 0;
	    var t2h = (sigma0h + majh + getCarry(t2l, sigma0l)) | 0;

	    hh = gh;
	    hl = gl;
	    gh = fh;
	    gl = fl;
	    fh = eh;
	    fl = el;
	    el = (dl + t1l) | 0;
	    eh = (dh + t1h + getCarry(el, dl)) | 0;
	    dh = ch;
	    dl = cl;
	    ch = bh;
	    cl = bl;
	    bh = ah;
	    bl = al;
	    al = (t1l + t2l) | 0;
	    ah = (t1h + t2h + getCarry(al, t1l)) | 0;
	  }

	  this._al = (this._al + al) | 0;
	  this._bl = (this._bl + bl) | 0;
	  this._cl = (this._cl + cl) | 0;
	  this._dl = (this._dl + dl) | 0;
	  this._el = (this._el + el) | 0;
	  this._fl = (this._fl + fl) | 0;
	  this._gl = (this._gl + gl) | 0;
	  this._hl = (this._hl + hl) | 0;

	  this._ah = (this._ah + ah + getCarry(this._al, al)) | 0;
	  this._bh = (this._bh + bh + getCarry(this._bl, bl)) | 0;
	  this._ch = (this._ch + ch + getCarry(this._cl, cl)) | 0;
	  this._dh = (this._dh + dh + getCarry(this._dl, dl)) | 0;
	  this._eh = (this._eh + eh + getCarry(this._el, el)) | 0;
	  this._fh = (this._fh + fh + getCarry(this._fl, fl)) | 0;
	  this._gh = (this._gh + gh + getCarry(this._gl, gl)) | 0;
	  this._hh = (this._hh + hh + getCarry(this._hl, hl)) | 0;
	};

	Sha512.prototype._hash = function () {
	  var H = Buffer$7.allocUnsafe(64);

	  function writeInt64BE (h, l, offset) {
	    H.writeInt32BE(h, offset);
	    H.writeInt32BE(l, offset + 4);
	  }

	  writeInt64BE(this._ah, this._al, 0);
	  writeInt64BE(this._bh, this._bl, 8);
	  writeInt64BE(this._ch, this._cl, 16);
	  writeInt64BE(this._dh, this._dl, 24);
	  writeInt64BE(this._eh, this._el, 32);
	  writeInt64BE(this._fh, this._fl, 40);
	  writeInt64BE(this._gh, this._gl, 48);
	  writeInt64BE(this._hh, this._hl, 56);

	  return H
	};

	var sha512 = Sha512;

	var Buffer$8 = safeBuffer.Buffer;

	var W$5 = new Array(160);

	function Sha384 () {
	  this.init();
	  this._w = W$5;

	  hash.call(this, 128, 112);
	}

	inherits$2(Sha384, sha512);

	Sha384.prototype.init = function () {
	  this._ah = 0xcbbb9d5d;
	  this._bh = 0x629a292a;
	  this._ch = 0x9159015a;
	  this._dh = 0x152fecd8;
	  this._eh = 0x67332667;
	  this._fh = 0x8eb44a87;
	  this._gh = 0xdb0c2e0d;
	  this._hh = 0x47b5481d;

	  this._al = 0xc1059ed8;
	  this._bl = 0x367cd507;
	  this._cl = 0x3070dd17;
	  this._dl = 0xf70e5939;
	  this._el = 0xffc00b31;
	  this._fl = 0x68581511;
	  this._gl = 0x64f98fa7;
	  this._hl = 0xbefa4fa4;

	  return this
	};

	Sha384.prototype._hash = function () {
	  var H = Buffer$8.allocUnsafe(48);

	  function writeInt64BE (h, l, offset) {
	    H.writeInt32BE(h, offset);
	    H.writeInt32BE(l, offset + 4);
	  }

	  writeInt64BE(this._ah, this._al, 0);
	  writeInt64BE(this._bh, this._bl, 8);
	  writeInt64BE(this._ch, this._cl, 16);
	  writeInt64BE(this._dh, this._dl, 24);
	  writeInt64BE(this._eh, this._el, 32);
	  writeInt64BE(this._fh, this._fl, 40);

	  return H
	};

	var sha384 = Sha384;

	var sha_js = createCommonjsModule(function (module) {
	var exports = module.exports = function SHA (algorithm) {
	  algorithm = algorithm.toLowerCase();

	  var Algorithm = exports[algorithm];
	  if (!Algorithm) throw new Error(algorithm + ' is not supported (we accept pull requests)')

	  return new Algorithm()
	};

	exports.sha = sha;
	exports.sha1 = sha1;
	exports.sha224 = sha224;
	exports.sha256 = sha256;
	exports.sha384 = sha384;
	exports.sha512 = sha512;
	});

	var require$$0 = /*@__PURE__*/getAugmentedNamespace(empty$1);

	function createHash(kind) {
	    if (isNodeLike.isNodeLike) {
	        return require$$0.createHash(kind);
	    }
	    return sha_js(kind);
	}
	var createHash_2 = createHash;


	var createHash_1 = /*#__PURE__*/Object.defineProperty({
		createHash: createHash_2
	}, '__esModule', {value: true});

	function mapValues(object, callback) {
	    const result = Object.create(null);
	    for (const [key, value] of Object.entries(object)) {
	        result[key] = callback(value);
	    }
	    return result;
	}
	var mapValues_2 = mapValues;


	var mapValues_1 = /*#__PURE__*/Object.defineProperty({
		mapValues: mapValues_2
	}, '__esModule', {value: true});

	function isNotNullOrUndefined(value) {
	    return value !== null && typeof value !== "undefined";
	}
	var isNotNullOrUndefined_1 = isNotNullOrUndefined;


	var predicates = /*#__PURE__*/Object.defineProperty({
		isNotNullOrUndefined: isNotNullOrUndefined_1
	}, '__esModule', {value: true});

	var utils = createCommonjsModule(function (module, exports) {
	function __export(m) {
	    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
	}
	Object.defineProperty(exports, "__esModule", { value: true });
	__export(createHash_1);
	__export(isNodeLike);
	__export(mapValues_1);
	__export(predicates);

	});

	var lib = createCommonjsModule(function (module, exports) {
	function __export(m) {
	    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
	}
	Object.defineProperty(exports, "__esModule", { value: true });

	__export(fetch$1);
	__export(utils);

	});

	/**
	 * lodash (Custom Build) <https://lodash.com/>
	 * Build: `lodash modularize exports="npm" -o ./`
	 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
	 * Released under MIT license <https://lodash.com/license>
	 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
	 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
	 */

	var lodash_sortby = createCommonjsModule(function (module, exports) {
	/** Used as the size to enable large array optimizations. */
	var LARGE_ARRAY_SIZE = 200;

	/** Used as the `TypeError` message for "Functions" methods. */
	var FUNC_ERROR_TEXT = 'Expected a function';

	/** Used to stand-in for `undefined` hash values. */
	var HASH_UNDEFINED = '__lodash_hash_undefined__';

	/** Used to compose bitmasks for comparison styles. */
	var UNORDERED_COMPARE_FLAG = 1,
	    PARTIAL_COMPARE_FLAG = 2;

	/** Used as references for various `Number` constants. */
	var INFINITY = 1 / 0,
	    MAX_SAFE_INTEGER = 9007199254740991;

	/** `Object#toString` result references. */
	var argsTag = '[object Arguments]',
	    arrayTag = '[object Array]',
	    boolTag = '[object Boolean]',
	    dateTag = '[object Date]',
	    errorTag = '[object Error]',
	    funcTag = '[object Function]',
	    genTag = '[object GeneratorFunction]',
	    mapTag = '[object Map]',
	    numberTag = '[object Number]',
	    objectTag = '[object Object]',
	    promiseTag = '[object Promise]',
	    regexpTag = '[object RegExp]',
	    setTag = '[object Set]',
	    stringTag = '[object String]',
	    symbolTag = '[object Symbol]',
	    weakMapTag = '[object WeakMap]';

	var arrayBufferTag = '[object ArrayBuffer]',
	    dataViewTag = '[object DataView]',
	    float32Tag = '[object Float32Array]',
	    float64Tag = '[object Float64Array]',
	    int8Tag = '[object Int8Array]',
	    int16Tag = '[object Int16Array]',
	    int32Tag = '[object Int32Array]',
	    uint8Tag = '[object Uint8Array]',
	    uint8ClampedTag = '[object Uint8ClampedArray]',
	    uint16Tag = '[object Uint16Array]',
	    uint32Tag = '[object Uint32Array]';

	/** Used to match property names within property paths. */
	var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
	    reIsPlainProp = /^\w*$/,
	    reLeadingDot = /^\./,
	    rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

	/**
	 * Used to match `RegExp`
	 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
	 */
	var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

	/** Used to match backslashes in property paths. */
	var reEscapeChar = /\\(\\)?/g;

	/** Used to detect host constructors (Safari). */
	var reIsHostCtor = /^\[object .+?Constructor\]$/;

	/** Used to detect unsigned integer values. */
	var reIsUint = /^(?:0|[1-9]\d*)$/;

	/** Used to identify `toStringTag` values of typed arrays. */
	var typedArrayTags = {};
	typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
	typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
	typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
	typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
	typedArrayTags[uint32Tag] = true;
	typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
	typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
	typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
	typedArrayTags[errorTag] = typedArrayTags[funcTag] =
	typedArrayTags[mapTag] = typedArrayTags[numberTag] =
	typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
	typedArrayTags[setTag] = typedArrayTags[stringTag] =
	typedArrayTags[weakMapTag] = false;

	/** Detect free variable `global` from Node.js. */
	var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

	/** Detect free variable `self`. */
	var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

	/** Used as a reference to the global object. */
	var root = freeGlobal || freeSelf || Function('return this')();

	/** Detect free variable `exports`. */
	var freeExports =  exports && !exports.nodeType && exports;

	/** Detect free variable `module`. */
	var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

	/** Detect the popular CommonJS extension `module.exports`. */
	var moduleExports = freeModule && freeModule.exports === freeExports;

	/** Detect free variable `process` from Node.js. */
	var freeProcess = moduleExports && freeGlobal.process;

	/** Used to access faster Node.js helpers. */
	var nodeUtil = (function() {
	  try {
	    return freeProcess && freeProcess.binding('util');
	  } catch (e) {}
	}());

	/* Node.js helper references. */
	var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

	/**
	 * A faster alternative to `Function#apply`, this function invokes `func`
	 * with the `this` binding of `thisArg` and the arguments of `args`.
	 *
	 * @private
	 * @param {Function} func The function to invoke.
	 * @param {*} thisArg The `this` binding of `func`.
	 * @param {Array} args The arguments to invoke `func` with.
	 * @returns {*} Returns the result of `func`.
	 */
	function apply(func, thisArg, args) {
	  switch (args.length) {
	    case 0: return func.call(thisArg);
	    case 1: return func.call(thisArg, args[0]);
	    case 2: return func.call(thisArg, args[0], args[1]);
	    case 3: return func.call(thisArg, args[0], args[1], args[2]);
	  }
	  return func.apply(thisArg, args);
	}

	/**
	 * A specialized version of `_.map` for arrays without support for iteratee
	 * shorthands.
	 *
	 * @private
	 * @param {Array} [array] The array to iterate over.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Array} Returns the new mapped array.
	 */
	function arrayMap(array, iteratee) {
	  var index = -1,
	      length = array ? array.length : 0,
	      result = Array(length);

	  while (++index < length) {
	    result[index] = iteratee(array[index], index, array);
	  }
	  return result;
	}

	/**
	 * Appends the elements of `values` to `array`.
	 *
	 * @private
	 * @param {Array} array The array to modify.
	 * @param {Array} values The values to append.
	 * @returns {Array} Returns `array`.
	 */
	function arrayPush(array, values) {
	  var index = -1,
	      length = values.length,
	      offset = array.length;

	  while (++index < length) {
	    array[offset + index] = values[index];
	  }
	  return array;
	}

	/**
	 * A specialized version of `_.some` for arrays without support for iteratee
	 * shorthands.
	 *
	 * @private
	 * @param {Array} [array] The array to iterate over.
	 * @param {Function} predicate The function invoked per iteration.
	 * @returns {boolean} Returns `true` if any element passes the predicate check,
	 *  else `false`.
	 */
	function arraySome(array, predicate) {
	  var index = -1,
	      length = array ? array.length : 0;

	  while (++index < length) {
	    if (predicate(array[index], index, array)) {
	      return true;
	    }
	  }
	  return false;
	}

	/**
	 * The base implementation of `_.property` without support for deep paths.
	 *
	 * @private
	 * @param {string} key The key of the property to get.
	 * @returns {Function} Returns the new accessor function.
	 */
	function baseProperty(key) {
	  return function(object) {
	    return object == null ? undefined : object[key];
	  };
	}

	/**
	 * The base implementation of `_.sortBy` which uses `comparer` to define the
	 * sort order of `array` and replaces criteria objects with their corresponding
	 * values.
	 *
	 * @private
	 * @param {Array} array The array to sort.
	 * @param {Function} comparer The function to define sort order.
	 * @returns {Array} Returns `array`.
	 */
	function baseSortBy(array, comparer) {
	  var length = array.length;

	  array.sort(comparer);
	  while (length--) {
	    array[length] = array[length].value;
	  }
	  return array;
	}

	/**
	 * The base implementation of `_.times` without support for iteratee shorthands
	 * or max array length checks.
	 *
	 * @private
	 * @param {number} n The number of times to invoke `iteratee`.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Array} Returns the array of results.
	 */
	function baseTimes(n, iteratee) {
	  var index = -1,
	      result = Array(n);

	  while (++index < n) {
	    result[index] = iteratee(index);
	  }
	  return result;
	}

	/**
	 * The base implementation of `_.unary` without support for storing metadata.
	 *
	 * @private
	 * @param {Function} func The function to cap arguments for.
	 * @returns {Function} Returns the new capped function.
	 */
	function baseUnary(func) {
	  return function(value) {
	    return func(value);
	  };
	}

	/**
	 * Gets the value at `key` of `object`.
	 *
	 * @private
	 * @param {Object} [object] The object to query.
	 * @param {string} key The key of the property to get.
	 * @returns {*} Returns the property value.
	 */
	function getValue(object, key) {
	  return object == null ? undefined : object[key];
	}

	/**
	 * Checks if `value` is a host object in IE < 9.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
	 */
	function isHostObject(value) {
	  // Many host objects are `Object` objects that can coerce to strings
	  // despite having improperly defined `toString` methods.
	  var result = false;
	  if (value != null && typeof value.toString != 'function') {
	    try {
	      result = !!(value + '');
	    } catch (e) {}
	  }
	  return result;
	}

	/**
	 * Converts `map` to its key-value pairs.
	 *
	 * @private
	 * @param {Object} map The map to convert.
	 * @returns {Array} Returns the key-value pairs.
	 */
	function mapToArray(map) {
	  var index = -1,
	      result = Array(map.size);

	  map.forEach(function(value, key) {
	    result[++index] = [key, value];
	  });
	  return result;
	}

	/**
	 * Creates a unary function that invokes `func` with its argument transformed.
	 *
	 * @private
	 * @param {Function} func The function to wrap.
	 * @param {Function} transform The argument transform.
	 * @returns {Function} Returns the new function.
	 */
	function overArg(func, transform) {
	  return function(arg) {
	    return func(transform(arg));
	  };
	}

	/**
	 * Converts `set` to an array of its values.
	 *
	 * @private
	 * @param {Object} set The set to convert.
	 * @returns {Array} Returns the values.
	 */
	function setToArray(set) {
	  var index = -1,
	      result = Array(set.size);

	  set.forEach(function(value) {
	    result[++index] = value;
	  });
	  return result;
	}

	/** Used for built-in method references. */
	var arrayProto = Array.prototype,
	    funcProto = Function.prototype,
	    objectProto = Object.prototype;

	/** Used to detect overreaching core-js shims. */
	var coreJsData = root['__core-js_shared__'];

	/** Used to detect methods masquerading as native. */
	var maskSrcKey = (function() {
	  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
	  return uid ? ('Symbol(src)_1.' + uid) : '';
	}());

	/** Used to resolve the decompiled source of functions. */
	var funcToString = funcProto.toString;

	/** Used to check objects for own properties. */
	var hasOwnProperty = objectProto.hasOwnProperty;

	/**
	 * Used to resolve the
	 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
	 * of values.
	 */
	var objectToString = objectProto.toString;

	/** Used to detect if a method is native. */
	var reIsNative = RegExp('^' +
	  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
	  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
	);

	/** Built-in value references. */
	var Symbol = root.Symbol,
	    Uint8Array = root.Uint8Array,
	    propertyIsEnumerable = objectProto.propertyIsEnumerable,
	    splice = arrayProto.splice,
	    spreadableSymbol = Symbol ? Symbol.isConcatSpreadable : undefined;

	/* Built-in method references for those with the same name as other `lodash` methods. */
	var nativeKeys = overArg(Object.keys, Object),
	    nativeMax = Math.max;

	/* Built-in method references that are verified to be native. */
	var DataView = getNative(root, 'DataView'),
	    Map = getNative(root, 'Map'),
	    Promise = getNative(root, 'Promise'),
	    Set = getNative(root, 'Set'),
	    WeakMap = getNative(root, 'WeakMap'),
	    nativeCreate = getNative(Object, 'create');

	/** Used to detect maps, sets, and weakmaps. */
	var dataViewCtorString = toSource(DataView),
	    mapCtorString = toSource(Map),
	    promiseCtorString = toSource(Promise),
	    setCtorString = toSource(Set),
	    weakMapCtorString = toSource(WeakMap);

	/** Used to convert symbols to primitives and strings. */
	var symbolProto = Symbol ? Symbol.prototype : undefined,
	    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined,
	    symbolToString = symbolProto ? symbolProto.toString : undefined;

	/**
	 * Creates a hash object.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function Hash(entries) {
	  var index = -1,
	      length = entries ? entries.length : 0;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the hash.
	 *
	 * @private
	 * @name clear
	 * @memberOf Hash
	 */
	function hashClear() {
	  this.__data__ = nativeCreate ? nativeCreate(null) : {};
	}

	/**
	 * Removes `key` and its value from the hash.
	 *
	 * @private
	 * @name delete
	 * @memberOf Hash
	 * @param {Object} hash The hash to modify.
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function hashDelete(key) {
	  return this.has(key) && delete this.__data__[key];
	}

	/**
	 * Gets the hash value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf Hash
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function hashGet(key) {
	  var data = this.__data__;
	  if (nativeCreate) {
	    var result = data[key];
	    return result === HASH_UNDEFINED ? undefined : result;
	  }
	  return hasOwnProperty.call(data, key) ? data[key] : undefined;
	}

	/**
	 * Checks if a hash value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf Hash
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function hashHas(key) {
	  var data = this.__data__;
	  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
	}

	/**
	 * Sets the hash `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf Hash
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the hash instance.
	 */
	function hashSet(key, value) {
	  var data = this.__data__;
	  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
	  return this;
	}

	// Add methods to `Hash`.
	Hash.prototype.clear = hashClear;
	Hash.prototype['delete'] = hashDelete;
	Hash.prototype.get = hashGet;
	Hash.prototype.has = hashHas;
	Hash.prototype.set = hashSet;

	/**
	 * Creates an list cache object.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function ListCache(entries) {
	  var index = -1,
	      length = entries ? entries.length : 0;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the list cache.
	 *
	 * @private
	 * @name clear
	 * @memberOf ListCache
	 */
	function listCacheClear() {
	  this.__data__ = [];
	}

	/**
	 * Removes `key` and its value from the list cache.
	 *
	 * @private
	 * @name delete
	 * @memberOf ListCache
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function listCacheDelete(key) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  if (index < 0) {
	    return false;
	  }
	  var lastIndex = data.length - 1;
	  if (index == lastIndex) {
	    data.pop();
	  } else {
	    splice.call(data, index, 1);
	  }
	  return true;
	}

	/**
	 * Gets the list cache value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf ListCache
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function listCacheGet(key) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  return index < 0 ? undefined : data[index][1];
	}

	/**
	 * Checks if a list cache value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf ListCache
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function listCacheHas(key) {
	  return assocIndexOf(this.__data__, key) > -1;
	}

	/**
	 * Sets the list cache `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf ListCache
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the list cache instance.
	 */
	function listCacheSet(key, value) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  if (index < 0) {
	    data.push([key, value]);
	  } else {
	    data[index][1] = value;
	  }
	  return this;
	}

	// Add methods to `ListCache`.
	ListCache.prototype.clear = listCacheClear;
	ListCache.prototype['delete'] = listCacheDelete;
	ListCache.prototype.get = listCacheGet;
	ListCache.prototype.has = listCacheHas;
	ListCache.prototype.set = listCacheSet;

	/**
	 * Creates a map cache object to store key-value pairs.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function MapCache(entries) {
	  var index = -1,
	      length = entries ? entries.length : 0;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the map.
	 *
	 * @private
	 * @name clear
	 * @memberOf MapCache
	 */
	function mapCacheClear() {
	  this.__data__ = {
	    'hash': new Hash,
	    'map': new (Map || ListCache),
	    'string': new Hash
	  };
	}

	/**
	 * Removes `key` and its value from the map.
	 *
	 * @private
	 * @name delete
	 * @memberOf MapCache
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function mapCacheDelete(key) {
	  return getMapData(this, key)['delete'](key);
	}

	/**
	 * Gets the map value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf MapCache
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function mapCacheGet(key) {
	  return getMapData(this, key).get(key);
	}

	/**
	 * Checks if a map value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf MapCache
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function mapCacheHas(key) {
	  return getMapData(this, key).has(key);
	}

	/**
	 * Sets the map `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf MapCache
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the map cache instance.
	 */
	function mapCacheSet(key, value) {
	  getMapData(this, key).set(key, value);
	  return this;
	}

	// Add methods to `MapCache`.
	MapCache.prototype.clear = mapCacheClear;
	MapCache.prototype['delete'] = mapCacheDelete;
	MapCache.prototype.get = mapCacheGet;
	MapCache.prototype.has = mapCacheHas;
	MapCache.prototype.set = mapCacheSet;

	/**
	 *
	 * Creates an array cache object to store unique values.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [values] The values to cache.
	 */
	function SetCache(values) {
	  var index = -1,
	      length = values ? values.length : 0;

	  this.__data__ = new MapCache;
	  while (++index < length) {
	    this.add(values[index]);
	  }
	}

	/**
	 * Adds `value` to the array cache.
	 *
	 * @private
	 * @name add
	 * @memberOf SetCache
	 * @alias push
	 * @param {*} value The value to cache.
	 * @returns {Object} Returns the cache instance.
	 */
	function setCacheAdd(value) {
	  this.__data__.set(value, HASH_UNDEFINED);
	  return this;
	}

	/**
	 * Checks if `value` is in the array cache.
	 *
	 * @private
	 * @name has
	 * @memberOf SetCache
	 * @param {*} value The value to search for.
	 * @returns {number} Returns `true` if `value` is found, else `false`.
	 */
	function setCacheHas(value) {
	  return this.__data__.has(value);
	}

	// Add methods to `SetCache`.
	SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
	SetCache.prototype.has = setCacheHas;

	/**
	 * Creates a stack cache object to store key-value pairs.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function Stack(entries) {
	  this.__data__ = new ListCache(entries);
	}

	/**
	 * Removes all key-value entries from the stack.
	 *
	 * @private
	 * @name clear
	 * @memberOf Stack
	 */
	function stackClear() {
	  this.__data__ = new ListCache;
	}

	/**
	 * Removes `key` and its value from the stack.
	 *
	 * @private
	 * @name delete
	 * @memberOf Stack
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function stackDelete(key) {
	  return this.__data__['delete'](key);
	}

	/**
	 * Gets the stack value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf Stack
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function stackGet(key) {
	  return this.__data__.get(key);
	}

	/**
	 * Checks if a stack value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf Stack
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function stackHas(key) {
	  return this.__data__.has(key);
	}

	/**
	 * Sets the stack `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf Stack
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the stack cache instance.
	 */
	function stackSet(key, value) {
	  var cache = this.__data__;
	  if (cache instanceof ListCache) {
	    var pairs = cache.__data__;
	    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
	      pairs.push([key, value]);
	      return this;
	    }
	    cache = this.__data__ = new MapCache(pairs);
	  }
	  cache.set(key, value);
	  return this;
	}

	// Add methods to `Stack`.
	Stack.prototype.clear = stackClear;
	Stack.prototype['delete'] = stackDelete;
	Stack.prototype.get = stackGet;
	Stack.prototype.has = stackHas;
	Stack.prototype.set = stackSet;

	/**
	 * Creates an array of the enumerable property names of the array-like `value`.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @param {boolean} inherited Specify returning inherited property names.
	 * @returns {Array} Returns the array of property names.
	 */
	function arrayLikeKeys(value, inherited) {
	  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
	  // Safari 9 makes `arguments.length` enumerable in strict mode.
	  var result = (isArray(value) || isArguments(value))
	    ? baseTimes(value.length, String)
	    : [];

	  var length = result.length,
	      skipIndexes = !!length;

	  for (var key in value) {
	    if ((inherited || hasOwnProperty.call(value, key)) &&
	        !(skipIndexes && (key == 'length' || isIndex(key, length)))) {
	      result.push(key);
	    }
	  }
	  return result;
	}

	/**
	 * Gets the index at which the `key` is found in `array` of key-value pairs.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {*} key The key to search for.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function assocIndexOf(array, key) {
	  var length = array.length;
	  while (length--) {
	    if (eq(array[length][0], key)) {
	      return length;
	    }
	  }
	  return -1;
	}

	/**
	 * The base implementation of `_.forEach` without support for iteratee shorthands.
	 *
	 * @private
	 * @param {Array|Object} collection The collection to iterate over.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Array|Object} Returns `collection`.
	 */
	var baseEach = createBaseEach(baseForOwn);

	/**
	 * The base implementation of `_.flatten` with support for restricting flattening.
	 *
	 * @private
	 * @param {Array} array The array to flatten.
	 * @param {number} depth The maximum recursion depth.
	 * @param {boolean} [predicate=isFlattenable] The function invoked per iteration.
	 * @param {boolean} [isStrict] Restrict to values that pass `predicate` checks.
	 * @param {Array} [result=[]] The initial result value.
	 * @returns {Array} Returns the new flattened array.
	 */
	function baseFlatten(array, depth, predicate, isStrict, result) {
	  var index = -1,
	      length = array.length;

	  predicate || (predicate = isFlattenable);
	  result || (result = []);

	  while (++index < length) {
	    var value = array[index];
	    if (depth > 0 && predicate(value)) {
	      if (depth > 1) {
	        // Recursively flatten arrays (susceptible to call stack limits).
	        baseFlatten(value, depth - 1, predicate, isStrict, result);
	      } else {
	        arrayPush(result, value);
	      }
	    } else if (!isStrict) {
	      result[result.length] = value;
	    }
	  }
	  return result;
	}

	/**
	 * The base implementation of `baseForOwn` which iterates over `object`
	 * properties returned by `keysFunc` and invokes `iteratee` for each property.
	 * Iteratee functions may exit iteration early by explicitly returning `false`.
	 *
	 * @private
	 * @param {Object} object The object to iterate over.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @param {Function} keysFunc The function to get the keys of `object`.
	 * @returns {Object} Returns `object`.
	 */
	var baseFor = createBaseFor();

	/**
	 * The base implementation of `_.forOwn` without support for iteratee shorthands.
	 *
	 * @private
	 * @param {Object} object The object to iterate over.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Object} Returns `object`.
	 */
	function baseForOwn(object, iteratee) {
	  return object && baseFor(object, iteratee, keys);
	}

	/**
	 * The base implementation of `_.get` without support for default values.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path of the property to get.
	 * @returns {*} Returns the resolved value.
	 */
	function baseGet(object, path) {
	  path = isKey(path, object) ? [path] : castPath(path);

	  var index = 0,
	      length = path.length;

	  while (object != null && index < length) {
	    object = object[toKey(path[index++])];
	  }
	  return (index && index == length) ? object : undefined;
	}

	/**
	 * The base implementation of `getTag`.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the `toStringTag`.
	 */
	function baseGetTag(value) {
	  return objectToString.call(value);
	}

	/**
	 * The base implementation of `_.hasIn` without support for deep paths.
	 *
	 * @private
	 * @param {Object} [object] The object to query.
	 * @param {Array|string} key The key to check.
	 * @returns {boolean} Returns `true` if `key` exists, else `false`.
	 */
	function baseHasIn(object, key) {
	  return object != null && key in Object(object);
	}

	/**
	 * The base implementation of `_.isEqual` which supports partial comparisons
	 * and tracks traversed objects.
	 *
	 * @private
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @param {Function} [customizer] The function to customize comparisons.
	 * @param {boolean} [bitmask] The bitmask of comparison flags.
	 *  The bitmask may be composed of the following flags:
	 *     1 - Unordered comparison
	 *     2 - Partial comparison
	 * @param {Object} [stack] Tracks traversed `value` and `other` objects.
	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	 */
	function baseIsEqual(value, other, customizer, bitmask, stack) {
	  if (value === other) {
	    return true;
	  }
	  if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
	    return value !== value && other !== other;
	  }
	  return baseIsEqualDeep(value, other, baseIsEqual, customizer, bitmask, stack);
	}

	/**
	 * A specialized version of `baseIsEqual` for arrays and objects which performs
	 * deep comparisons and tracks traversed objects enabling objects with circular
	 * references to be compared.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Function} [customizer] The function to customize comparisons.
	 * @param {number} [bitmask] The bitmask of comparison flags. See `baseIsEqual`
	 *  for more details.
	 * @param {Object} [stack] Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function baseIsEqualDeep(object, other, equalFunc, customizer, bitmask, stack) {
	  var objIsArr = isArray(object),
	      othIsArr = isArray(other),
	      objTag = arrayTag,
	      othTag = arrayTag;

	  if (!objIsArr) {
	    objTag = getTag(object);
	    objTag = objTag == argsTag ? objectTag : objTag;
	  }
	  if (!othIsArr) {
	    othTag = getTag(other);
	    othTag = othTag == argsTag ? objectTag : othTag;
	  }
	  var objIsObj = objTag == objectTag && !isHostObject(object),
	      othIsObj = othTag == objectTag && !isHostObject(other),
	      isSameTag = objTag == othTag;

	  if (isSameTag && !objIsObj) {
	    stack || (stack = new Stack);
	    return (objIsArr || isTypedArray(object))
	      ? equalArrays(object, other, equalFunc, customizer, bitmask, stack)
	      : equalByTag(object, other, objTag, equalFunc, customizer, bitmask, stack);
	  }
	  if (!(bitmask & PARTIAL_COMPARE_FLAG)) {
	    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
	        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

	    if (objIsWrapped || othIsWrapped) {
	      var objUnwrapped = objIsWrapped ? object.value() : object,
	          othUnwrapped = othIsWrapped ? other.value() : other;

	      stack || (stack = new Stack);
	      return equalFunc(objUnwrapped, othUnwrapped, customizer, bitmask, stack);
	    }
	  }
	  if (!isSameTag) {
	    return false;
	  }
	  stack || (stack = new Stack);
	  return equalObjects(object, other, equalFunc, customizer, bitmask, stack);
	}

	/**
	 * The base implementation of `_.isMatch` without support for iteratee shorthands.
	 *
	 * @private
	 * @param {Object} object The object to inspect.
	 * @param {Object} source The object of property values to match.
	 * @param {Array} matchData The property names, values, and compare flags to match.
	 * @param {Function} [customizer] The function to customize comparisons.
	 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
	 */
	function baseIsMatch(object, source, matchData, customizer) {
	  var index = matchData.length,
	      length = index,
	      noCustomizer = !customizer;

	  if (object == null) {
	    return !length;
	  }
	  object = Object(object);
	  while (index--) {
	    var data = matchData[index];
	    if ((noCustomizer && data[2])
	          ? data[1] !== object[data[0]]
	          : !(data[0] in object)
	        ) {
	      return false;
	    }
	  }
	  while (++index < length) {
	    data = matchData[index];
	    var key = data[0],
	        objValue = object[key],
	        srcValue = data[1];

	    if (noCustomizer && data[2]) {
	      if (objValue === undefined && !(key in object)) {
	        return false;
	      }
	    } else {
	      var stack = new Stack;
	      if (customizer) {
	        var result = customizer(objValue, srcValue, key, object, source, stack);
	      }
	      if (!(result === undefined
	            ? baseIsEqual(srcValue, objValue, customizer, UNORDERED_COMPARE_FLAG | PARTIAL_COMPARE_FLAG, stack)
	            : result
	          )) {
	        return false;
	      }
	    }
	  }
	  return true;
	}

	/**
	 * The base implementation of `_.isNative` without bad shim checks.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a native function,
	 *  else `false`.
	 */
	function baseIsNative(value) {
	  if (!isObject(value) || isMasked(value)) {
	    return false;
	  }
	  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
	  return pattern.test(toSource(value));
	}

	/**
	 * The base implementation of `_.isTypedArray` without Node.js optimizations.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
	 */
	function baseIsTypedArray(value) {
	  return isObjectLike(value) &&
	    isLength(value.length) && !!typedArrayTags[objectToString.call(value)];
	}

	/**
	 * The base implementation of `_.iteratee`.
	 *
	 * @private
	 * @param {*} [value=_.identity] The value to convert to an iteratee.
	 * @returns {Function} Returns the iteratee.
	 */
	function baseIteratee(value) {
	  // Don't store the `typeof` result in a variable to avoid a JIT bug in Safari 9.
	  // See https://bugs.webkit.org/show_bug.cgi?id=156034 for more details.
	  if (typeof value == 'function') {
	    return value;
	  }
	  if (value == null) {
	    return identity;
	  }
	  if (typeof value == 'object') {
	    return isArray(value)
	      ? baseMatchesProperty(value[0], value[1])
	      : baseMatches(value);
	  }
	  return property(value);
	}

	/**
	 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the array of property names.
	 */
	function baseKeys(object) {
	  if (!isPrototype(object)) {
	    return nativeKeys(object);
	  }
	  var result = [];
	  for (var key in Object(object)) {
	    if (hasOwnProperty.call(object, key) && key != 'constructor') {
	      result.push(key);
	    }
	  }
	  return result;
	}

	/**
	 * The base implementation of `_.map` without support for iteratee shorthands.
	 *
	 * @private
	 * @param {Array|Object} collection The collection to iterate over.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Array} Returns the new mapped array.
	 */
	function baseMap(collection, iteratee) {
	  var index = -1,
	      result = isArrayLike(collection) ? Array(collection.length) : [];

	  baseEach(collection, function(value, key, collection) {
	    result[++index] = iteratee(value, key, collection);
	  });
	  return result;
	}

	/**
	 * The base implementation of `_.matches` which doesn't clone `source`.
	 *
	 * @private
	 * @param {Object} source The object of property values to match.
	 * @returns {Function} Returns the new spec function.
	 */
	function baseMatches(source) {
	  var matchData = getMatchData(source);
	  if (matchData.length == 1 && matchData[0][2]) {
	    return matchesStrictComparable(matchData[0][0], matchData[0][1]);
	  }
	  return function(object) {
	    return object === source || baseIsMatch(object, source, matchData);
	  };
	}

	/**
	 * The base implementation of `_.matchesProperty` which doesn't clone `srcValue`.
	 *
	 * @private
	 * @param {string} path The path of the property to get.
	 * @param {*} srcValue The value to match.
	 * @returns {Function} Returns the new spec function.
	 */
	function baseMatchesProperty(path, srcValue) {
	  if (isKey(path) && isStrictComparable(srcValue)) {
	    return matchesStrictComparable(toKey(path), srcValue);
	  }
	  return function(object) {
	    var objValue = get(object, path);
	    return (objValue === undefined && objValue === srcValue)
	      ? hasIn(object, path)
	      : baseIsEqual(srcValue, objValue, undefined, UNORDERED_COMPARE_FLAG | PARTIAL_COMPARE_FLAG);
	  };
	}

	/**
	 * The base implementation of `_.orderBy` without param guards.
	 *
	 * @private
	 * @param {Array|Object} collection The collection to iterate over.
	 * @param {Function[]|Object[]|string[]} iteratees The iteratees to sort by.
	 * @param {string[]} orders The sort orders of `iteratees`.
	 * @returns {Array} Returns the new sorted array.
	 */
	function baseOrderBy(collection, iteratees, orders) {
	  var index = -1;
	  iteratees = arrayMap(iteratees.length ? iteratees : [identity], baseUnary(baseIteratee));

	  var result = baseMap(collection, function(value, key, collection) {
	    var criteria = arrayMap(iteratees, function(iteratee) {
	      return iteratee(value);
	    });
	    return { 'criteria': criteria, 'index': ++index, 'value': value };
	  });

	  return baseSortBy(result, function(object, other) {
	    return compareMultiple(object, other, orders);
	  });
	}

	/**
	 * A specialized version of `baseProperty` which supports deep paths.
	 *
	 * @private
	 * @param {Array|string} path The path of the property to get.
	 * @returns {Function} Returns the new accessor function.
	 */
	function basePropertyDeep(path) {
	  return function(object) {
	    return baseGet(object, path);
	  };
	}

	/**
	 * The base implementation of `_.rest` which doesn't validate or coerce arguments.
	 *
	 * @private
	 * @param {Function} func The function to apply a rest parameter to.
	 * @param {number} [start=func.length-1] The start position of the rest parameter.
	 * @returns {Function} Returns the new function.
	 */
	function baseRest(func, start) {
	  start = nativeMax(start === undefined ? (func.length - 1) : start, 0);
	  return function() {
	    var args = arguments,
	        index = -1,
	        length = nativeMax(args.length - start, 0),
	        array = Array(length);

	    while (++index < length) {
	      array[index] = args[start + index];
	    }
	    index = -1;
	    var otherArgs = Array(start + 1);
	    while (++index < start) {
	      otherArgs[index] = args[index];
	    }
	    otherArgs[start] = array;
	    return apply(func, this, otherArgs);
	  };
	}

	/**
	 * The base implementation of `_.toString` which doesn't convert nullish
	 * values to empty strings.
	 *
	 * @private
	 * @param {*} value The value to process.
	 * @returns {string} Returns the string.
	 */
	function baseToString(value) {
	  // Exit early for strings to avoid a performance hit in some environments.
	  if (typeof value == 'string') {
	    return value;
	  }
	  if (isSymbol(value)) {
	    return symbolToString ? symbolToString.call(value) : '';
	  }
	  var result = (value + '');
	  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
	}

	/**
	 * Casts `value` to a path array if it's not one.
	 *
	 * @private
	 * @param {*} value The value to inspect.
	 * @returns {Array} Returns the cast property path array.
	 */
	function castPath(value) {
	  return isArray(value) ? value : stringToPath(value);
	}

	/**
	 * Compares values to sort them in ascending order.
	 *
	 * @private
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @returns {number} Returns the sort order indicator for `value`.
	 */
	function compareAscending(value, other) {
	  if (value !== other) {
	    var valIsDefined = value !== undefined,
	        valIsNull = value === null,
	        valIsReflexive = value === value,
	        valIsSymbol = isSymbol(value);

	    var othIsDefined = other !== undefined,
	        othIsNull = other === null,
	        othIsReflexive = other === other,
	        othIsSymbol = isSymbol(other);

	    if ((!othIsNull && !othIsSymbol && !valIsSymbol && value > other) ||
	        (valIsSymbol && othIsDefined && othIsReflexive && !othIsNull && !othIsSymbol) ||
	        (valIsNull && othIsDefined && othIsReflexive) ||
	        (!valIsDefined && othIsReflexive) ||
	        !valIsReflexive) {
	      return 1;
	    }
	    if ((!valIsNull && !valIsSymbol && !othIsSymbol && value < other) ||
	        (othIsSymbol && valIsDefined && valIsReflexive && !valIsNull && !valIsSymbol) ||
	        (othIsNull && valIsDefined && valIsReflexive) ||
	        (!othIsDefined && valIsReflexive) ||
	        !othIsReflexive) {
	      return -1;
	    }
	  }
	  return 0;
	}

	/**
	 * Used by `_.orderBy` to compare multiple properties of a value to another
	 * and stable sort them.
	 *
	 * If `orders` is unspecified, all values are sorted in ascending order. Otherwise,
	 * specify an order of "desc" for descending or "asc" for ascending sort order
	 * of corresponding values.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {boolean[]|string[]} orders The order to sort by for each property.
	 * @returns {number} Returns the sort order indicator for `object`.
	 */
	function compareMultiple(object, other, orders) {
	  var index = -1,
	      objCriteria = object.criteria,
	      othCriteria = other.criteria,
	      length = objCriteria.length,
	      ordersLength = orders.length;

	  while (++index < length) {
	    var result = compareAscending(objCriteria[index], othCriteria[index]);
	    if (result) {
	      if (index >= ordersLength) {
	        return result;
	      }
	      var order = orders[index];
	      return result * (order == 'desc' ? -1 : 1);
	    }
	  }
	  // Fixes an `Array#sort` bug in the JS engine embedded in Adobe applications
	  // that causes it, under certain circumstances, to provide the same value for
	  // `object` and `other`. See https://github.com/jashkenas/underscore/pull/1247
	  // for more details.
	  //
	  // This also ensures a stable sort in V8 and other engines.
	  // See https://bugs.chromium.org/p/v8/issues/detail?id=90 for more details.
	  return object.index - other.index;
	}

	/**
	 * Creates a `baseEach` or `baseEachRight` function.
	 *
	 * @private
	 * @param {Function} eachFunc The function to iterate over a collection.
	 * @param {boolean} [fromRight] Specify iterating from right to left.
	 * @returns {Function} Returns the new base function.
	 */
	function createBaseEach(eachFunc, fromRight) {
	  return function(collection, iteratee) {
	    if (collection == null) {
	      return collection;
	    }
	    if (!isArrayLike(collection)) {
	      return eachFunc(collection, iteratee);
	    }
	    var length = collection.length,
	        index = fromRight ? length : -1,
	        iterable = Object(collection);

	    while ((fromRight ? index-- : ++index < length)) {
	      if (iteratee(iterable[index], index, iterable) === false) {
	        break;
	      }
	    }
	    return collection;
	  };
	}

	/**
	 * Creates a base function for methods like `_.forIn` and `_.forOwn`.
	 *
	 * @private
	 * @param {boolean} [fromRight] Specify iterating from right to left.
	 * @returns {Function} Returns the new base function.
	 */
	function createBaseFor(fromRight) {
	  return function(object, iteratee, keysFunc) {
	    var index = -1,
	        iterable = Object(object),
	        props = keysFunc(object),
	        length = props.length;

	    while (length--) {
	      var key = props[fromRight ? length : ++index];
	      if (iteratee(iterable[key], key, iterable) === false) {
	        break;
	      }
	    }
	    return object;
	  };
	}

	/**
	 * A specialized version of `baseIsEqualDeep` for arrays with support for
	 * partial deep comparisons.
	 *
	 * @private
	 * @param {Array} array The array to compare.
	 * @param {Array} other The other array to compare.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
	 *  for more details.
	 * @param {Object} stack Tracks traversed `array` and `other` objects.
	 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
	 */
	function equalArrays(array, other, equalFunc, customizer, bitmask, stack) {
	  var isPartial = bitmask & PARTIAL_COMPARE_FLAG,
	      arrLength = array.length,
	      othLength = other.length;

	  if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
	    return false;
	  }
	  // Assume cyclic values are equal.
	  var stacked = stack.get(array);
	  if (stacked && stack.get(other)) {
	    return stacked == other;
	  }
	  var index = -1,
	      result = true,
	      seen = (bitmask & UNORDERED_COMPARE_FLAG) ? new SetCache : undefined;

	  stack.set(array, other);
	  stack.set(other, array);

	  // Ignore non-index properties.
	  while (++index < arrLength) {
	    var arrValue = array[index],
	        othValue = other[index];

	    if (customizer) {
	      var compared = isPartial
	        ? customizer(othValue, arrValue, index, other, array, stack)
	        : customizer(arrValue, othValue, index, array, other, stack);
	    }
	    if (compared !== undefined) {
	      if (compared) {
	        continue;
	      }
	      result = false;
	      break;
	    }
	    // Recursively compare arrays (susceptible to call stack limits).
	    if (seen) {
	      if (!arraySome(other, function(othValue, othIndex) {
	            if (!seen.has(othIndex) &&
	                (arrValue === othValue || equalFunc(arrValue, othValue, customizer, bitmask, stack))) {
	              return seen.add(othIndex);
	            }
	          })) {
	        result = false;
	        break;
	      }
	    } else if (!(
	          arrValue === othValue ||
	            equalFunc(arrValue, othValue, customizer, bitmask, stack)
	        )) {
	      result = false;
	      break;
	    }
	  }
	  stack['delete'](array);
	  stack['delete'](other);
	  return result;
	}

	/**
	 * A specialized version of `baseIsEqualDeep` for comparing objects of
	 * the same `toStringTag`.
	 *
	 * **Note:** This function only supports comparing values with tags of
	 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {string} tag The `toStringTag` of the objects to compare.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
	 *  for more details.
	 * @param {Object} stack Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function equalByTag(object, other, tag, equalFunc, customizer, bitmask, stack) {
	  switch (tag) {
	    case dataViewTag:
	      if ((object.byteLength != other.byteLength) ||
	          (object.byteOffset != other.byteOffset)) {
	        return false;
	      }
	      object = object.buffer;
	      other = other.buffer;

	    case arrayBufferTag:
	      if ((object.byteLength != other.byteLength) ||
	          !equalFunc(new Uint8Array(object), new Uint8Array(other))) {
	        return false;
	      }
	      return true;

	    case boolTag:
	    case dateTag:
	    case numberTag:
	      // Coerce booleans to `1` or `0` and dates to milliseconds.
	      // Invalid dates are coerced to `NaN`.
	      return eq(+object, +other);

	    case errorTag:
	      return object.name == other.name && object.message == other.message;

	    case regexpTag:
	    case stringTag:
	      // Coerce regexes to strings and treat strings, primitives and objects,
	      // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
	      // for more details.
	      return object == (other + '');

	    case mapTag:
	      var convert = mapToArray;

	    case setTag:
	      var isPartial = bitmask & PARTIAL_COMPARE_FLAG;
	      convert || (convert = setToArray);

	      if (object.size != other.size && !isPartial) {
	        return false;
	      }
	      // Assume cyclic values are equal.
	      var stacked = stack.get(object);
	      if (stacked) {
	        return stacked == other;
	      }
	      bitmask |= UNORDERED_COMPARE_FLAG;

	      // Recursively compare objects (susceptible to call stack limits).
	      stack.set(object, other);
	      var result = equalArrays(convert(object), convert(other), equalFunc, customizer, bitmask, stack);
	      stack['delete'](object);
	      return result;

	    case symbolTag:
	      if (symbolValueOf) {
	        return symbolValueOf.call(object) == symbolValueOf.call(other);
	      }
	  }
	  return false;
	}

	/**
	 * A specialized version of `baseIsEqualDeep` for objects with support for
	 * partial deep comparisons.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
	 *  for more details.
	 * @param {Object} stack Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function equalObjects(object, other, equalFunc, customizer, bitmask, stack) {
	  var isPartial = bitmask & PARTIAL_COMPARE_FLAG,
	      objProps = keys(object),
	      objLength = objProps.length,
	      othProps = keys(other),
	      othLength = othProps.length;

	  if (objLength != othLength && !isPartial) {
	    return false;
	  }
	  var index = objLength;
	  while (index--) {
	    var key = objProps[index];
	    if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
	      return false;
	    }
	  }
	  // Assume cyclic values are equal.
	  var stacked = stack.get(object);
	  if (stacked && stack.get(other)) {
	    return stacked == other;
	  }
	  var result = true;
	  stack.set(object, other);
	  stack.set(other, object);

	  var skipCtor = isPartial;
	  while (++index < objLength) {
	    key = objProps[index];
	    var objValue = object[key],
	        othValue = other[key];

	    if (customizer) {
	      var compared = isPartial
	        ? customizer(othValue, objValue, key, other, object, stack)
	        : customizer(objValue, othValue, key, object, other, stack);
	    }
	    // Recursively compare objects (susceptible to call stack limits).
	    if (!(compared === undefined
	          ? (objValue === othValue || equalFunc(objValue, othValue, customizer, bitmask, stack))
	          : compared
	        )) {
	      result = false;
	      break;
	    }
	    skipCtor || (skipCtor = key == 'constructor');
	  }
	  if (result && !skipCtor) {
	    var objCtor = object.constructor,
	        othCtor = other.constructor;

	    // Non `Object` object instances with different constructors are not equal.
	    if (objCtor != othCtor &&
	        ('constructor' in object && 'constructor' in other) &&
	        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
	          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
	      result = false;
	    }
	  }
	  stack['delete'](object);
	  stack['delete'](other);
	  return result;
	}

	/**
	 * Gets the data for `map`.
	 *
	 * @private
	 * @param {Object} map The map to query.
	 * @param {string} key The reference key.
	 * @returns {*} Returns the map data.
	 */
	function getMapData(map, key) {
	  var data = map.__data__;
	  return isKeyable(key)
	    ? data[typeof key == 'string' ? 'string' : 'hash']
	    : data.map;
	}

	/**
	 * Gets the property names, values, and compare flags of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the match data of `object`.
	 */
	function getMatchData(object) {
	  var result = keys(object),
	      length = result.length;

	  while (length--) {
	    var key = result[length],
	        value = object[key];

	    result[length] = [key, value, isStrictComparable(value)];
	  }
	  return result;
	}

	/**
	 * Gets the native function at `key` of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {string} key The key of the method to get.
	 * @returns {*} Returns the function if it's native, else `undefined`.
	 */
	function getNative(object, key) {
	  var value = getValue(object, key);
	  return baseIsNative(value) ? value : undefined;
	}

	/**
	 * Gets the `toStringTag` of `value`.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the `toStringTag`.
	 */
	var getTag = baseGetTag;

	// Fallback for data views, maps, sets, and weak maps in IE 11,
	// for data views in Edge < 14, and promises in Node.js.
	if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
	    (Map && getTag(new Map) != mapTag) ||
	    (Promise && getTag(Promise.resolve()) != promiseTag) ||
	    (Set && getTag(new Set) != setTag) ||
	    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
	  getTag = function(value) {
	    var result = objectToString.call(value),
	        Ctor = result == objectTag ? value.constructor : undefined,
	        ctorString = Ctor ? toSource(Ctor) : undefined;

	    if (ctorString) {
	      switch (ctorString) {
	        case dataViewCtorString: return dataViewTag;
	        case mapCtorString: return mapTag;
	        case promiseCtorString: return promiseTag;
	        case setCtorString: return setTag;
	        case weakMapCtorString: return weakMapTag;
	      }
	    }
	    return result;
	  };
	}

	/**
	 * Checks if `path` exists on `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path to check.
	 * @param {Function} hasFunc The function to check properties.
	 * @returns {boolean} Returns `true` if `path` exists, else `false`.
	 */
	function hasPath(object, path, hasFunc) {
	  path = isKey(path, object) ? [path] : castPath(path);

	  var result,
	      index = -1,
	      length = path.length;

	  while (++index < length) {
	    var key = toKey(path[index]);
	    if (!(result = object != null && hasFunc(object, key))) {
	      break;
	    }
	    object = object[key];
	  }
	  if (result) {
	    return result;
	  }
	  var length = object ? object.length : 0;
	  return !!length && isLength(length) && isIndex(key, length) &&
	    (isArray(object) || isArguments(object));
	}

	/**
	 * Checks if `value` is a flattenable `arguments` object or array.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is flattenable, else `false`.
	 */
	function isFlattenable(value) {
	  return isArray(value) || isArguments(value) ||
	    !!(spreadableSymbol && value && value[spreadableSymbol]);
	}

	/**
	 * Checks if `value` is a valid array-like index.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
	 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
	 */
	function isIndex(value, length) {
	  length = length == null ? MAX_SAFE_INTEGER : length;
	  return !!length &&
	    (typeof value == 'number' || reIsUint.test(value)) &&
	    (value > -1 && value % 1 == 0 && value < length);
	}

	/**
	 * Checks if the given arguments are from an iteratee call.
	 *
	 * @private
	 * @param {*} value The potential iteratee value argument.
	 * @param {*} index The potential iteratee index or key argument.
	 * @param {*} object The potential iteratee object argument.
	 * @returns {boolean} Returns `true` if the arguments are from an iteratee call,
	 *  else `false`.
	 */
	function isIterateeCall(value, index, object) {
	  if (!isObject(object)) {
	    return false;
	  }
	  var type = typeof index;
	  if (type == 'number'
	        ? (isArrayLike(object) && isIndex(index, object.length))
	        : (type == 'string' && index in object)
	      ) {
	    return eq(object[index], value);
	  }
	  return false;
	}

	/**
	 * Checks if `value` is a property name and not a property path.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @param {Object} [object] The object to query keys on.
	 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
	 */
	function isKey(value, object) {
	  if (isArray(value)) {
	    return false;
	  }
	  var type = typeof value;
	  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
	      value == null || isSymbol(value)) {
	    return true;
	  }
	  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
	    (object != null && value in Object(object));
	}

	/**
	 * Checks if `value` is suitable for use as unique object key.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
	 */
	function isKeyable(value) {
	  var type = typeof value;
	  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
	    ? (value !== '__proto__')
	    : (value === null);
	}

	/**
	 * Checks if `func` has its source masked.
	 *
	 * @private
	 * @param {Function} func The function to check.
	 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
	 */
	function isMasked(func) {
	  return !!maskSrcKey && (maskSrcKey in func);
	}

	/**
	 * Checks if `value` is likely a prototype object.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
	 */
	function isPrototype(value) {
	  var Ctor = value && value.constructor,
	      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

	  return value === proto;
	}

	/**
	 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` if suitable for strict
	 *  equality comparisons, else `false`.
	 */
	function isStrictComparable(value) {
	  return value === value && !isObject(value);
	}

	/**
	 * A specialized version of `matchesProperty` for source values suitable
	 * for strict equality comparisons, i.e. `===`.
	 *
	 * @private
	 * @param {string} key The key of the property to get.
	 * @param {*} srcValue The value to match.
	 * @returns {Function} Returns the new spec function.
	 */
	function matchesStrictComparable(key, srcValue) {
	  return function(object) {
	    if (object == null) {
	      return false;
	    }
	    return object[key] === srcValue &&
	      (srcValue !== undefined || (key in Object(object)));
	  };
	}

	/**
	 * Converts `string` to a property path array.
	 *
	 * @private
	 * @param {string} string The string to convert.
	 * @returns {Array} Returns the property path array.
	 */
	var stringToPath = memoize(function(string) {
	  string = toString(string);

	  var result = [];
	  if (reLeadingDot.test(string)) {
	    result.push('');
	  }
	  string.replace(rePropName, function(match, number, quote, string) {
	    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
	  });
	  return result;
	});

	/**
	 * Converts `value` to a string key if it's not a string or symbol.
	 *
	 * @private
	 * @param {*} value The value to inspect.
	 * @returns {string|symbol} Returns the key.
	 */
	function toKey(value) {
	  if (typeof value == 'string' || isSymbol(value)) {
	    return value;
	  }
	  var result = (value + '');
	  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
	}

	/**
	 * Converts `func` to its source code.
	 *
	 * @private
	 * @param {Function} func The function to process.
	 * @returns {string} Returns the source code.
	 */
	function toSource(func) {
	  if (func != null) {
	    try {
	      return funcToString.call(func);
	    } catch (e) {}
	    try {
	      return (func + '');
	    } catch (e) {}
	  }
	  return '';
	}

	/**
	 * Creates an array of elements, sorted in ascending order by the results of
	 * running each element in a collection thru each iteratee. This method
	 * performs a stable sort, that is, it preserves the original sort order of
	 * equal elements. The iteratees are invoked with one argument: (value).
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Collection
	 * @param {Array|Object} collection The collection to iterate over.
	 * @param {...(Function|Function[])} [iteratees=[_.identity]]
	 *  The iteratees to sort by.
	 * @returns {Array} Returns the new sorted array.
	 * @example
	 *
	 * var users = [
	 *   { 'user': 'fred',   'age': 48 },
	 *   { 'user': 'barney', 'age': 36 },
	 *   { 'user': 'fred',   'age': 40 },
	 *   { 'user': 'barney', 'age': 34 }
	 * ];
	 *
	 * _.sortBy(users, function(o) { return o.user; });
	 * // => objects for [['barney', 36], ['barney', 34], ['fred', 48], ['fred', 40]]
	 *
	 * _.sortBy(users, ['user', 'age']);
	 * // => objects for [['barney', 34], ['barney', 36], ['fred', 40], ['fred', 48]]
	 *
	 * _.sortBy(users, 'user', function(o) {
	 *   return Math.floor(o.age / 10);
	 * });
	 * // => objects for [['barney', 36], ['barney', 34], ['fred', 48], ['fred', 40]]
	 */
	var sortBy = baseRest(function(collection, iteratees) {
	  if (collection == null) {
	    return [];
	  }
	  var length = iteratees.length;
	  if (length > 1 && isIterateeCall(collection, iteratees[0], iteratees[1])) {
	    iteratees = [];
	  } else if (length > 2 && isIterateeCall(iteratees[0], iteratees[1], iteratees[2])) {
	    iteratees = [iteratees[0]];
	  }
	  return baseOrderBy(collection, baseFlatten(iteratees, 1), []);
	});

	/**
	 * Creates a function that memoizes the result of `func`. If `resolver` is
	 * provided, it determines the cache key for storing the result based on the
	 * arguments provided to the memoized function. By default, the first argument
	 * provided to the memoized function is used as the map cache key. The `func`
	 * is invoked with the `this` binding of the memoized function.
	 *
	 * **Note:** The cache is exposed as the `cache` property on the memoized
	 * function. Its creation may be customized by replacing the `_.memoize.Cache`
	 * constructor with one whose instances implement the
	 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
	 * method interface of `delete`, `get`, `has`, and `set`.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Function
	 * @param {Function} func The function to have its output memoized.
	 * @param {Function} [resolver] The function to resolve the cache key.
	 * @returns {Function} Returns the new memoized function.
	 * @example
	 *
	 * var object = { 'a': 1, 'b': 2 };
	 * var other = { 'c': 3, 'd': 4 };
	 *
	 * var values = _.memoize(_.values);
	 * values(object);
	 * // => [1, 2]
	 *
	 * values(other);
	 * // => [3, 4]
	 *
	 * object.a = 2;
	 * values(object);
	 * // => [1, 2]
	 *
	 * // Modify the result cache.
	 * values.cache.set(object, ['a', 'b']);
	 * values(object);
	 * // => ['a', 'b']
	 *
	 * // Replace `_.memoize.Cache`.
	 * _.memoize.Cache = WeakMap;
	 */
	function memoize(func, resolver) {
	  if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
	    throw new TypeError(FUNC_ERROR_TEXT);
	  }
	  var memoized = function() {
	    var args = arguments,
	        key = resolver ? resolver.apply(this, args) : args[0],
	        cache = memoized.cache;

	    if (cache.has(key)) {
	      return cache.get(key);
	    }
	    var result = func.apply(this, args);
	    memoized.cache = cache.set(key, result);
	    return result;
	  };
	  memoized.cache = new (memoize.Cache || MapCache);
	  return memoized;
	}

	// Assign cache to `_.memoize`.
	memoize.Cache = MapCache;

	/**
	 * Performs a
	 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
	 * comparison between two values to determine if they are equivalent.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	 * @example
	 *
	 * var object = { 'a': 1 };
	 * var other = { 'a': 1 };
	 *
	 * _.eq(object, object);
	 * // => true
	 *
	 * _.eq(object, other);
	 * // => false
	 *
	 * _.eq('a', 'a');
	 * // => true
	 *
	 * _.eq('a', Object('a'));
	 * // => false
	 *
	 * _.eq(NaN, NaN);
	 * // => true
	 */
	function eq(value, other) {
	  return value === other || (value !== value && other !== other);
	}

	/**
	 * Checks if `value` is likely an `arguments` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
	 *  else `false`.
	 * @example
	 *
	 * _.isArguments(function() { return arguments; }());
	 * // => true
	 *
	 * _.isArguments([1, 2, 3]);
	 * // => false
	 */
	function isArguments(value) {
	  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
	  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
	    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
	}

	/**
	 * Checks if `value` is classified as an `Array` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
	 * @example
	 *
	 * _.isArray([1, 2, 3]);
	 * // => true
	 *
	 * _.isArray(document.body.children);
	 * // => false
	 *
	 * _.isArray('abc');
	 * // => false
	 *
	 * _.isArray(_.noop);
	 * // => false
	 */
	var isArray = Array.isArray;

	/**
	 * Checks if `value` is array-like. A value is considered array-like if it's
	 * not a function and has a `value.length` that's an integer greater than or
	 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
	 * @example
	 *
	 * _.isArrayLike([1, 2, 3]);
	 * // => true
	 *
	 * _.isArrayLike(document.body.children);
	 * // => true
	 *
	 * _.isArrayLike('abc');
	 * // => true
	 *
	 * _.isArrayLike(_.noop);
	 * // => false
	 */
	function isArrayLike(value) {
	  return value != null && isLength(value.length) && !isFunction(value);
	}

	/**
	 * This method is like `_.isArrayLike` except that it also checks if `value`
	 * is an object.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an array-like object,
	 *  else `false`.
	 * @example
	 *
	 * _.isArrayLikeObject([1, 2, 3]);
	 * // => true
	 *
	 * _.isArrayLikeObject(document.body.children);
	 * // => true
	 *
	 * _.isArrayLikeObject('abc');
	 * // => false
	 *
	 * _.isArrayLikeObject(_.noop);
	 * // => false
	 */
	function isArrayLikeObject(value) {
	  return isObjectLike(value) && isArrayLike(value);
	}

	/**
	 * Checks if `value` is classified as a `Function` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
	 * @example
	 *
	 * _.isFunction(_);
	 * // => true
	 *
	 * _.isFunction(/abc/);
	 * // => false
	 */
	function isFunction(value) {
	  // The use of `Object#toString` avoids issues with the `typeof` operator
	  // in Safari 8-9 which returns 'object' for typed array and other constructors.
	  var tag = isObject(value) ? objectToString.call(value) : '';
	  return tag == funcTag || tag == genTag;
	}

	/**
	 * Checks if `value` is a valid array-like length.
	 *
	 * **Note:** This method is loosely based on
	 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
	 * @example
	 *
	 * _.isLength(3);
	 * // => true
	 *
	 * _.isLength(Number.MIN_VALUE);
	 * // => false
	 *
	 * _.isLength(Infinity);
	 * // => false
	 *
	 * _.isLength('3');
	 * // => false
	 */
	function isLength(value) {
	  return typeof value == 'number' &&
	    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
	}

	/**
	 * Checks if `value` is the
	 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
	 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
	 * @example
	 *
	 * _.isObject({});
	 * // => true
	 *
	 * _.isObject([1, 2, 3]);
	 * // => true
	 *
	 * _.isObject(_.noop);
	 * // => true
	 *
	 * _.isObject(null);
	 * // => false
	 */
	function isObject(value) {
	  var type = typeof value;
	  return !!value && (type == 'object' || type == 'function');
	}

	/**
	 * Checks if `value` is object-like. A value is object-like if it's not `null`
	 * and has a `typeof` result of "object".
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
	 * @example
	 *
	 * _.isObjectLike({});
	 * // => true
	 *
	 * _.isObjectLike([1, 2, 3]);
	 * // => true
	 *
	 * _.isObjectLike(_.noop);
	 * // => false
	 *
	 * _.isObjectLike(null);
	 * // => false
	 */
	function isObjectLike(value) {
	  return !!value && typeof value == 'object';
	}

	/**
	 * Checks if `value` is classified as a `Symbol` primitive or object.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
	 * @example
	 *
	 * _.isSymbol(Symbol.iterator);
	 * // => true
	 *
	 * _.isSymbol('abc');
	 * // => false
	 */
	function isSymbol(value) {
	  return typeof value == 'symbol' ||
	    (isObjectLike(value) && objectToString.call(value) == symbolTag);
	}

	/**
	 * Checks if `value` is classified as a typed array.
	 *
	 * @static
	 * @memberOf _
	 * @since 3.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
	 * @example
	 *
	 * _.isTypedArray(new Uint8Array);
	 * // => true
	 *
	 * _.isTypedArray([]);
	 * // => false
	 */
	var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

	/**
	 * Converts `value` to a string. An empty string is returned for `null`
	 * and `undefined` values. The sign of `-0` is preserved.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to process.
	 * @returns {string} Returns the string.
	 * @example
	 *
	 * _.toString(null);
	 * // => ''
	 *
	 * _.toString(-0);
	 * // => '-0'
	 *
	 * _.toString([1, 2, 3]);
	 * // => '1,2,3'
	 */
	function toString(value) {
	  return value == null ? '' : baseToString(value);
	}

	/**
	 * Gets the value at `path` of `object`. If the resolved value is
	 * `undefined`, the `defaultValue` is returned in its place.
	 *
	 * @static
	 * @memberOf _
	 * @since 3.7.0
	 * @category Object
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path of the property to get.
	 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
	 * @returns {*} Returns the resolved value.
	 * @example
	 *
	 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
	 *
	 * _.get(object, 'a[0].b.c');
	 * // => 3
	 *
	 * _.get(object, ['a', '0', 'b', 'c']);
	 * // => 3
	 *
	 * _.get(object, 'a.b.c', 'default');
	 * // => 'default'
	 */
	function get(object, path, defaultValue) {
	  var result = object == null ? undefined : baseGet(object, path);
	  return result === undefined ? defaultValue : result;
	}

	/**
	 * Checks if `path` is a direct or inherited property of `object`.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Object
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path to check.
	 * @returns {boolean} Returns `true` if `path` exists, else `false`.
	 * @example
	 *
	 * var object = _.create({ 'a': _.create({ 'b': 2 }) });
	 *
	 * _.hasIn(object, 'a');
	 * // => true
	 *
	 * _.hasIn(object, 'a.b');
	 * // => true
	 *
	 * _.hasIn(object, ['a', 'b']);
	 * // => true
	 *
	 * _.hasIn(object, 'b');
	 * // => false
	 */
	function hasIn(object, path) {
	  return object != null && hasPath(object, path, baseHasIn);
	}

	/**
	 * Creates an array of the own enumerable property names of `object`.
	 *
	 * **Note:** Non-object values are coerced to objects. See the
	 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
	 * for more details.
	 *
	 * @static
	 * @since 0.1.0
	 * @memberOf _
	 * @category Object
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the array of property names.
	 * @example
	 *
	 * function Foo() {
	 *   this.a = 1;
	 *   this.b = 2;
	 * }
	 *
	 * Foo.prototype.c = 3;
	 *
	 * _.keys(new Foo);
	 * // => ['a', 'b'] (iteration order is not guaranteed)
	 *
	 * _.keys('hi');
	 * // => ['0', '1']
	 */
	function keys(object) {
	  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
	}

	/**
	 * This method returns the first argument it receives.
	 *
	 * @static
	 * @since 0.1.0
	 * @memberOf _
	 * @category Util
	 * @param {*} value Any value.
	 * @returns {*} Returns `value`.
	 * @example
	 *
	 * var object = { 'a': 1 };
	 *
	 * console.log(_.identity(object) === object);
	 * // => true
	 */
	function identity(value) {
	  return value;
	}

	/**
	 * Creates a function that returns the value at `path` of a given object.
	 *
	 * @static
	 * @memberOf _
	 * @since 2.4.0
	 * @category Util
	 * @param {Array|string} path The path of the property to get.
	 * @returns {Function} Returns the new accessor function.
	 * @example
	 *
	 * var objects = [
	 *   { 'a': { 'b': 2 } },
	 *   { 'a': { 'b': 1 } }
	 * ];
	 *
	 * _.map(objects, _.property('a.b'));
	 * // => [2, 1]
	 *
	 * _.map(_.sortBy(objects, _.property(['a', 'b'])), 'a.b');
	 * // => [1, 2]
	 */
	function property(path) {
	  return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
	}

	module.exports = sortBy;
	});

	var visitor_1 = /*@__PURE__*/getAugmentedNamespace(visitor);

	var printer_1 = /*@__PURE__*/getAugmentedNamespace(printer);

	var utilities_1 = /*@__PURE__*/getAugmentedNamespace(utilities);

	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};




	const lodash_sortby_1 = __importDefault(lodash_sortby);
	function hideLiterals(ast) {
	    return visitor_1.visit(ast, {
	        IntValue(node) {
	            return Object.assign(Object.assign({}, node), { value: "0" });
	        },
	        FloatValue(node) {
	            return Object.assign(Object.assign({}, node), { value: "0" });
	        },
	        StringValue(node) {
	            return Object.assign(Object.assign({}, node), { value: "", block: false });
	        },
	        ListValue(node) {
	            return Object.assign(Object.assign({}, node), { values: [] });
	        },
	        ObjectValue(node) {
	            return Object.assign(Object.assign({}, node), { fields: [] });
	        }
	    });
	}
	var hideLiterals_1 = hideLiterals;
	function hideStringAndNumericLiterals(ast) {
	    return visitor_1.visit(ast, {
	        IntValue(node) {
	            return Object.assign(Object.assign({}, node), { value: "0" });
	        },
	        FloatValue(node) {
	            return Object.assign(Object.assign({}, node), { value: "0" });
	        },
	        StringValue(node) {
	            return Object.assign(Object.assign({}, node), { value: "", block: false });
	        }
	    });
	}
	var hideStringAndNumericLiterals_1 = hideStringAndNumericLiterals;
	function dropUnusedDefinitions(ast, operationName) {
	    const separated = utilities_1.separateOperations(ast)[operationName];
	    if (!separated) {
	        return ast;
	    }
	    return separated;
	}
	var dropUnusedDefinitions_1 = dropUnusedDefinitions;
	function sorted(items, ...iteratees) {
	    if (items) {
	        return lodash_sortby_1.default(items, ...iteratees);
	    }
	    return undefined;
	}
	function sortAST(ast) {
	    return visitor_1.visit(ast, {
	        Document(node) {
	            return Object.assign(Object.assign({}, node), { definitions: lodash_sortby_1.default(node.definitions, "kind", "name.value") });
	        },
	        OperationDefinition(node) {
	            return Object.assign(Object.assign({}, node), { variableDefinitions: sorted(node.variableDefinitions, "variable.name.value") });
	        },
	        SelectionSet(node) {
	            return Object.assign(Object.assign({}, node), { selections: lodash_sortby_1.default(node.selections, "kind", "name.value") });
	        },
	        Field(node) {
	            return Object.assign(Object.assign({}, node), { arguments: sorted(node.arguments, "name.value") });
	        },
	        FragmentSpread(node) {
	            return Object.assign(Object.assign({}, node), { directives: sorted(node.directives, "name.value") });
	        },
	        InlineFragment(node) {
	            return Object.assign(Object.assign({}, node), { directives: sorted(node.directives, "name.value") });
	        },
	        FragmentDefinition(node) {
	            return Object.assign(Object.assign({}, node), { directives: sorted(node.directives, "name.value"), variableDefinitions: sorted(node.variableDefinitions, "variable.name.value") });
	        },
	        Directive(node) {
	            return Object.assign(Object.assign({}, node), { arguments: sorted(node.arguments, "name.value") });
	        }
	    });
	}
	var sortAST_1 = sortAST;
	function removeAliases(ast) {
	    return visitor_1.visit(ast, {
	        Field(node) {
	            return Object.assign(Object.assign({}, node), { alias: undefined });
	        }
	    });
	}
	var removeAliases_1 = removeAliases;
	function printWithReducedWhitespace(ast) {
	    const sanitizedAST = visitor_1.visit(ast, {
	        StringValue(node) {
	            return Object.assign(Object.assign({}, node), { value: Buffer.from(node.value, "utf8").toString("hex"), block: false });
	        }
	    });
	    const withWhitespace = printer_1.print(sanitizedAST);
	    const minimizedButStillHex = withWhitespace
	        .replace(/\s+/g, " ")
	        .replace(/([^_a-zA-Z0-9]) /g, (_, c) => c)
	        .replace(/ ([^_a-zA-Z0-9])/g, (_, c) => c);
	    return minimizedButStillHex.replace(/"([a-f0-9]+)"/g, (_, hex) => JSON.stringify(Buffer.from(hex, "hex").toString("utf8")));
	}
	var printWithReducedWhitespace_1 = printWithReducedWhitespace;


	var transforms = /*#__PURE__*/Object.defineProperty({
		hideLiterals: hideLiterals_1,
		hideStringAndNumericLiterals: hideStringAndNumericLiterals_1,
		dropUnusedDefinitions: dropUnusedDefinitions_1,
		sortAST: sortAST_1,
		removeAliases: removeAliases_1,
		printWithReducedWhitespace: printWithReducedWhitespace_1
	}, '__esModule', {value: true});

	function defaultUsageReportingSignature(ast, operationName) {
	    return transforms.printWithReducedWhitespace(transforms.sortAST(transforms.removeAliases(transforms.hideLiterals(transforms.dropUnusedDefinitions(ast, operationName)))));
	}
	var defaultUsageReportingSignature_1 = defaultUsageReportingSignature;
	function operationRegistrySignature(ast, operationName, options = {
	    preserveStringAndNumericLiterals: false
	}) {
	    const withoutUnusedDefs = transforms.dropUnusedDefinitions(ast, operationName);
	    const maybeWithLiterals = options.preserveStringAndNumericLiterals
	        ? withoutUnusedDefs
	        : transforms.hideStringAndNumericLiterals(withoutUnusedDefs);
	    return transforms.printWithReducedWhitespace(transforms.sortAST(maybeWithLiterals));
	}
	var operationRegistrySignature_1 = operationRegistrySignature;
	function defaultOperationRegistrySignature(ast, operationName) {
	    return operationRegistrySignature(ast, operationName, {
	        preserveStringAndNumericLiterals: false
	    });
	}
	var defaultOperationRegistrySignature_1 = defaultOperationRegistrySignature;
	function operationHash(operation) {
	    return lib.createHash("sha256")
	        .update(operation)
	        .digest("hex");
	}
	var operationHash_1 = operationHash;


	var operationId = /*#__PURE__*/Object.defineProperty({
		defaultUsageReportingSignature: defaultUsageReportingSignature_1,
		operationRegistrySignature: operationRegistrySignature_1,
		defaultOperationRegistrySignature: defaultOperationRegistrySignature_1,
		operationHash: operationHash_1
	}, '__esModule', {value: true});

	var graphql_1 = /*@__PURE__*/getAugmentedNamespace(graphql$1);

	function isNode$1(maybeNode) {
	    return maybeNode && typeof maybeNode.kind === "string";
	}
	var isNode_1 = isNode$1;
	function isDocumentNode(node) {
	    return isNode$1(node) && node.kind === graphql_1.Kind.DOCUMENT;
	}
	var isDocumentNode_1 = isDocumentNode;


	var graphql$2 = /*#__PURE__*/Object.defineProperty({
		isNode: isNode_1,
		isDocumentNode: isDocumentNode_1
	}, '__esModule', {value: true});

	class GraphQLSchemaValidationError extends Error {
	    constructor(errors) {
	        super();
	        this.errors = errors;
	        this.name = this.constructor.name;
	        Error.captureStackTrace(this, this.constructor);
	        this.message = errors.map(error => error.message).join("\n\n");
	    }
	}
	var GraphQLSchemaValidationError_2 = GraphQLSchemaValidationError;


	var GraphQLSchemaValidationError_1 = /*#__PURE__*/Object.defineProperty({
		GraphQLSchemaValidationError: GraphQLSchemaValidationError_2
	}, '__esModule', {value: true});

	var validate_1 = /*@__PURE__*/getAugmentedNamespace(validate$1);

	var specifiedRules_1 = /*@__PURE__*/getAugmentedNamespace(specifiedRules$1);

	var validation_1 = /*@__PURE__*/getAugmentedNamespace(validation);

	var PossibleTypeExtensions_1 = /*@__PURE__*/getAugmentedNamespace(PossibleTypeExtensions$1);

	var buildSchemaFromSDL_1 = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });







	const skippedSDLRules = [
	    validation_1.KnownTypeNamesRule,
	    validation_1.UniqueDirectivesPerLocationRule
	];
	try {
	    const PossibleTypeExtensions = PossibleTypeExtensions_1
	        .PossibleTypeExtensions;
	    if (PossibleTypeExtensions) {
	        skippedSDLRules.push(PossibleTypeExtensions);
	    }
	}
	catch (e) {
	}
	const sdlRules = specifiedRules_1.specifiedSDLRules.filter(rule => !skippedSDLRules.includes(rule));
	function modulesFromSDL(modulesOrSDL) {
	    if (Array.isArray(modulesOrSDL)) {
	        return modulesOrSDL.map(moduleOrSDL => {
	            if (graphql$2.isNode(moduleOrSDL) && graphql$2.isDocumentNode(moduleOrSDL)) {
	                return { typeDefs: moduleOrSDL };
	            }
	            else {
	                return moduleOrSDL;
	            }
	        });
	    }
	    else {
	        return [{ typeDefs: modulesOrSDL }];
	    }
	}
	exports.modulesFromSDL = modulesFromSDL;
	function buildSchemaFromSDL(modulesOrSDL, schemaToExtend) {
	    const modules = modulesFromSDL(modulesOrSDL);
	    const documentAST = graphql_1.concatAST(modules.map(module => module.typeDefs));
	    const errors = validate_1.validateSDL(documentAST, schemaToExtend, sdlRules);
	    if (errors.length > 0) {
	        throw new GraphQLSchemaValidationError_1.GraphQLSchemaValidationError(errors);
	    }
	    const definitionsMap = Object.create(null);
	    const extensionsMap = Object.create(null);
	    const directiveDefinitions = [];
	    const schemaDefinitions = [];
	    const schemaExtensions = [];
	    for (const definition of documentAST.definitions) {
	        if (graphql_1.isTypeDefinitionNode(definition)) {
	            const typeName = definition.name.value;
	            if (definitionsMap[typeName]) {
	                definitionsMap[typeName].push(definition);
	            }
	            else {
	                definitionsMap[typeName] = [definition];
	            }
	        }
	        else if (graphql_1.isTypeExtensionNode(definition)) {
	            const typeName = definition.name.value;
	            if (extensionsMap[typeName]) {
	                extensionsMap[typeName].push(definition);
	            }
	            else {
	                extensionsMap[typeName] = [definition];
	            }
	        }
	        else if (definition.kind === graphql_1.Kind.DIRECTIVE_DEFINITION) {
	            directiveDefinitions.push(definition);
	        }
	        else if (definition.kind === graphql_1.Kind.SCHEMA_DEFINITION) {
	            schemaDefinitions.push(definition);
	        }
	        else if (definition.kind === graphql_1.Kind.SCHEMA_EXTENSION) {
	            schemaExtensions.push(definition);
	        }
	    }
	    let schema = schemaToExtend
	        ? schemaToExtend
	        : new graphql_1.GraphQLSchema({
	            query: undefined
	        });
	    const missingTypeDefinitions = [];
	    for (const [extendedTypeName, extensions] of Object.entries(extensionsMap)) {
	        if (!definitionsMap[extendedTypeName]) {
	            const extension = extensions[0];
	            const kind = extension.kind;
	            const definition = {
	                kind: extKindToDefKind[kind],
	                name: extension.name
	            };
	            missingTypeDefinitions.push(definition);
	        }
	    }
	    schema = graphql_1.extendSchema(schema, {
	        kind: graphql_1.Kind.DOCUMENT,
	        definitions: [
	            ...Object.values(definitionsMap).flat(),
	            ...missingTypeDefinitions,
	            ...directiveDefinitions
	        ]
	    }, {
	        assumeValidSDL: true
	    });
	    schema = graphql_1.extendSchema(schema, {
	        kind: graphql_1.Kind.DOCUMENT,
	        definitions: Object.values(extensionsMap).flat()
	    }, {
	        assumeValidSDL: true
	    });
	    let operationTypeMap;
	    if (schemaDefinitions.length > 0 || schemaExtensions.length > 0) {
	        operationTypeMap = {};
	        const operationTypes = [...schemaDefinitions, ...schemaExtensions]
	            .map(node => node.operationTypes)
	            .filter(lib.isNotNullOrUndefined)
	            .flat();
	        for (const { operation, type } of operationTypes) {
	            operationTypeMap[operation] = type.name.value;
	        }
	    }
	    else {
	        operationTypeMap = {
	            query: "Query",
	            mutation: "Mutation",
	            subscription: "Subscription"
	        };
	    }
	    schema = new graphql_1.GraphQLSchema(Object.assign(Object.assign({}, schema.toConfig()), lib.mapValues(operationTypeMap, typeName => typeName
	        ? schema.getType(typeName)
	        : undefined)));
	    for (const module of modules) {
	        if (!module.resolvers)
	            continue;
	        addResolversToSchema(schema, module.resolvers);
	    }
	    return schema;
	}
	exports.buildSchemaFromSDL = buildSchemaFromSDL;
	const extKindToDefKind = {
	    [graphql_1.Kind.SCALAR_TYPE_EXTENSION]: graphql_1.Kind.SCALAR_TYPE_DEFINITION,
	    [graphql_1.Kind.OBJECT_TYPE_EXTENSION]: graphql_1.Kind.OBJECT_TYPE_DEFINITION,
	    [graphql_1.Kind.INTERFACE_TYPE_EXTENSION]: graphql_1.Kind.INTERFACE_TYPE_DEFINITION,
	    [graphql_1.Kind.UNION_TYPE_EXTENSION]: graphql_1.Kind.UNION_TYPE_DEFINITION,
	    [graphql_1.Kind.ENUM_TYPE_EXTENSION]: graphql_1.Kind.ENUM_TYPE_DEFINITION,
	    [graphql_1.Kind.INPUT_OBJECT_TYPE_EXTENSION]: graphql_1.Kind.INPUT_OBJECT_TYPE_DEFINITION
	};
	function addResolversToSchema(schema, resolvers) {
	    for (const [typeName, fieldConfigs] of Object.entries(resolvers)) {
	        const type = schema.getType(typeName);
	        if (graphql_1.isAbstractType(type)) {
	            for (const [fieldName, fieldConfig] of Object.entries(fieldConfigs)) {
	                if (fieldName.startsWith("__")) {
	                    type[fieldName.substring(2)] = fieldConfig;
	                }
	            }
	        }
	        if (graphql_1.isScalarType(type)) {
	            for (const fn in fieldConfigs) {
	                type[fn] = fieldConfigs[fn];
	            }
	        }
	        if (graphql_1.isEnumType(type)) {
	            const values = type.getValues();
	            const newValues = {};
	            values.forEach(value => {
	                let newValue = fieldConfigs[value.name];
	                if (newValue === undefined) {
	                    newValue = value.name;
	                }
	                newValues[value.name] = {
	                    value: newValue,
	                    deprecationReason: value.deprecationReason,
	                    description: value.description,
	                    astNode: value.astNode,
	                    extensions: undefined
	                };
	            });
	            Object.assign(type, new graphql_1.GraphQLEnumType(Object.assign(Object.assign({}, type.toConfig()), { values: newValues })));
	        }
	        if (!graphql_1.isObjectType(type))
	            continue;
	        const fieldMap = type.getFields();
	        for (const [fieldName, fieldConfig] of Object.entries(fieldConfigs)) {
	            if (fieldName.startsWith("__")) {
	                type[fieldName.substring(2)] = fieldConfig;
	                continue;
	            }
	            const field = fieldMap[fieldName];
	            if (!field)
	                continue;
	            if (typeof fieldConfig === "function") {
	                field.resolve = fieldConfig;
	            }
	            else {
	                field.resolve = fieldConfig.resolve;
	            }
	        }
	    }
	}
	exports.addResolversToSchema = addResolversToSchema;

	});

	function transformSchema(schema, transformType) {
	    const typeMap = Object.create(null);
	    for (const oldType of Object.values(schema.getTypeMap())) {
	        if (graphql_1.isIntrospectionType(oldType))
	            continue;
	        const result = transformType(oldType);
	        if (result === null)
	            continue;
	        const newType = result || oldType;
	        typeMap[newType.name] = recreateNamedType(newType);
	    }
	    const schemaConfig = schema.toConfig();
	    return new graphql_1.GraphQLSchema(Object.assign(Object.assign({}, schemaConfig), { types: Object.values(typeMap), query: replaceMaybeType(schemaConfig.query), mutation: replaceMaybeType(schemaConfig.mutation), subscription: replaceMaybeType(schemaConfig.subscription) }));
	    function recreateNamedType(type) {
	        if (graphql_1.isObjectType(type)) {
	            const config = type.toConfig();
	            return new graphql_1.GraphQLObjectType(Object.assign(Object.assign({}, config), { interfaces: () => config.interfaces.map(replaceNamedType), fields: () => replaceFields(config.fields) }));
	        }
	        else if (graphql_1.isInterfaceType(type)) {
	            const config = type.toConfig();
	            return new graphql_1.GraphQLInterfaceType(Object.assign(Object.assign({}, config), { fields: () => replaceFields(config.fields) }));
	        }
	        else if (graphql_1.isUnionType(type)) {
	            const config = type.toConfig();
	            return new graphql_1.GraphQLUnionType(Object.assign(Object.assign({}, config), { types: () => config.types.map(replaceNamedType) }));
	        }
	        else if (graphql_1.isInputObjectType(type)) {
	            const config = type.toConfig();
	            return new graphql_1.GraphQLInputObjectType(Object.assign(Object.assign({}, config), { fields: () => replaceInputFields(config.fields) }));
	        }
	        return type;
	    }
	    function replaceType(type) {
	        if (graphql_1.isListType(type)) {
	            return new graphql_1.GraphQLList(replaceType(type.ofType));
	        }
	        else if (graphql_1.isNonNullType(type)) {
	            return new graphql_1.GraphQLNonNull(replaceType(type.ofType));
	        }
	        return replaceNamedType(type);
	    }
	    function replaceNamedType(type) {
	        const newType = typeMap[type.name];
	        return newType ? newType : type;
	    }
	    function replaceMaybeType(type) {
	        return type ? replaceNamedType(type) : undefined;
	    }
	    function replaceFields(fieldsMap) {
	        return lib.mapValues(fieldsMap, field => (Object.assign(Object.assign({}, field), { type: replaceType(field.type), args: field.args ? replaceArgs(field.args) : undefined })));
	    }
	    function replaceInputFields(fieldsMap) {
	        return lib.mapValues(fieldsMap, field => (Object.assign(Object.assign({}, field), { type: replaceType(field.type) })));
	    }
	    function replaceArgs(args) {
	        return lib.mapValues(args, arg => (Object.assign(Object.assign({}, arg), { type: replaceType(arg.type) })));
	    }
	}
	var transformSchema_2 = transformSchema;


	var transformSchema_1 = /*#__PURE__*/Object.defineProperty({
		transformSchema: transformSchema_2
	}, '__esModule', {value: true});

	var schema = createCommonjsModule(function (module, exports) {
	function __export(m) {
	    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
	}
	Object.defineProperty(exports, "__esModule", { value: true });
	__export(buildSchemaFromSDL_1);
	__export(GraphQLSchemaValidationError_1);
	__export(transformSchema_1);

	});

	var lib$1 = createCommonjsModule(function (module, exports) {
	function __export(m) {
	    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
	}
	Object.defineProperty(exports, "__esModule", { value: true });

	exports.defaultOperationRegistrySignature = operationId.defaultOperationRegistrySignature;
	exports.defaultUsageReportingSignature = operationId.defaultUsageReportingSignature;
	exports.operationRegistrySignature = operationId.operationRegistrySignature;
	exports.operationHash = operationId.operationHash;
	exports.defaultEngineReportingSignature = operationId.defaultUsageReportingSignature;
	__export(schema);

	});

	var directives = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.typeIncludesDirective = exports.gatherDirectives = exports.federationDirectives = exports.ProvidesDirective = exports.RequiresDirective = exports.ExternalDirective = exports.ExtendsDirective = exports.KeyDirective = void 0;

	exports.KeyDirective = new graphql_1.GraphQLDirective({
	    name: 'key',
	    locations: [graphql_1.DirectiveLocation.OBJECT, graphql_1.DirectiveLocation.INTERFACE],
	    args: {
	        fields: {
	            type: graphql_1.GraphQLNonNull(graphql_1.GraphQLString),
	        },
	    },
	});
	exports.ExtendsDirective = new graphql_1.GraphQLDirective({
	    name: 'extends',
	    locations: [graphql_1.DirectiveLocation.OBJECT, graphql_1.DirectiveLocation.INTERFACE],
	});
	exports.ExternalDirective = new graphql_1.GraphQLDirective({
	    name: 'external',
	    locations: [graphql_1.DirectiveLocation.OBJECT, graphql_1.DirectiveLocation.FIELD_DEFINITION],
	});
	exports.RequiresDirective = new graphql_1.GraphQLDirective({
	    name: 'requires',
	    locations: [graphql_1.DirectiveLocation.FIELD_DEFINITION],
	    args: {
	        fields: {
	            type: graphql_1.GraphQLNonNull(graphql_1.GraphQLString),
	        },
	    },
	});
	exports.ProvidesDirective = new graphql_1.GraphQLDirective({
	    name: 'provides',
	    locations: [graphql_1.DirectiveLocation.FIELD_DEFINITION],
	    args: {
	        fields: {
	            type: graphql_1.GraphQLNonNull(graphql_1.GraphQLString),
	        },
	    },
	});
	exports.federationDirectives = [
	    exports.KeyDirective,
	    exports.ExtendsDirective,
	    exports.ExternalDirective,
	    exports.RequiresDirective,
	    exports.ProvidesDirective,
	];
	exports.default = exports.federationDirectives;
	function hasDirectives(node) {
	    return Boolean('directives' in node && node.directives);
	}
	function gatherDirectives(type) {
	    let directives = [];
	    if ('extensionASTNodes' in type && type.extensionASTNodes) {
	        for (const node of type.extensionASTNodes) {
	            if (hasDirectives(node)) {
	                directives = directives.concat(node.directives);
	            }
	        }
	    }
	    if (type.astNode && hasDirectives(type.astNode))
	        directives = directives.concat(type.astNode.directives);
	    return directives;
	}
	exports.gatherDirectives = gatherDirectives;
	function typeIncludesDirective(type, directiveName) {
	    if (graphql_1.isInputObjectType(type))
	        return false;
	    const directives = gatherDirectives(type);
	    return directives.some(directive => directive.name.value === directiveName);
	}
	exports.typeIncludesDirective = typeIncludesDirective;

	});

	var utils$1 = createCommonjsModule(function (module, exports) {
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.getFederationMetadata = exports.defaultRootOperationNameLookup = exports.reservedRootFields = exports.isFederationDirective = exports.executableDirectiveLocations = exports.isNotNullOrUndefined = exports.mapValues = exports.defKindToExtKind = exports.typeNodesAreEquivalent = exports.diffTypeNodes = exports.isTypeNodeAnEntity = exports.selectionIncludesField = exports.findFieldsThatReturnType = exports.findTypesContainingFieldWithReturnType = exports.errorWithCode = exports.logDirective = exports.logServiceAndType = exports.hasMatchingFieldInDirectives = exports.parseSelections = exports.stripTypeSystemDirectivesFromTypeDefs = exports.stripExternalFieldsFromTypeDefs = exports.findDirectivesOnTypeOrField = exports.mapFieldNamesToServiceName = exports.isStringValueNode = void 0;

	const directives_1 = __importDefault(directives);
	function isStringValueNode(node) {
	    return node.kind === graphql_1.Kind.STRING;
	}
	exports.isStringValueNode = isStringValueNode;
	function mapFieldNamesToServiceName(fields, serviceName) {
	    return fields.reduce((prev, next) => {
	        prev[next.name.value] = serviceName;
	        return prev;
	    }, Object.create(null));
	}
	exports.mapFieldNamesToServiceName = mapFieldNamesToServiceName;
	function findDirectivesOnTypeOrField(node, directiveName) {
	    return node && node.directives
	        ? node.directives.filter(directive => directive.name.value === directiveName)
	        : [];
	}
	exports.findDirectivesOnTypeOrField = findDirectivesOnTypeOrField;
	function stripExternalFieldsFromTypeDefs(typeDefs, serviceName) {
	    const strippedFields = [];
	    const typeDefsWithoutExternalFields = graphql_1.visit(typeDefs, {
	        ObjectTypeExtension: removeExternalFieldsFromExtensionVisitor(strippedFields, serviceName),
	        InterfaceTypeExtension: removeExternalFieldsFromExtensionVisitor(strippedFields, serviceName),
	    });
	    return { typeDefsWithoutExternalFields, strippedFields };
	}
	exports.stripExternalFieldsFromTypeDefs = stripExternalFieldsFromTypeDefs;
	function stripTypeSystemDirectivesFromTypeDefs(typeDefs) {
	    const typeDefsWithoutTypeSystemDirectives = graphql_1.visit(typeDefs, {
	        Directive(node) {
	            if (node.name.value === 'deprecated' || node.name.value === 'specifiedBy')
	                return;
	            const isFederationDirective = directives_1.default.some(({ name }) => name === node.name.value);
	            return isFederationDirective ? undefined : null;
	        },
	    });
	    return typeDefsWithoutTypeSystemDirectives;
	}
	exports.stripTypeSystemDirectivesFromTypeDefs = stripTypeSystemDirectivesFromTypeDefs;
	function removeExternalFieldsFromExtensionVisitor(collector, serviceName) {
	    return (node) => {
	        let fields = node.fields;
	        if (fields) {
	            fields = fields.filter(field => {
	                const externalDirectives = findDirectivesOnTypeOrField(field, 'external');
	                if (externalDirectives.length > 0) {
	                    collector.push({
	                        field,
	                        parentTypeName: node.name.value,
	                        serviceName,
	                    });
	                    return false;
	                }
	                return true;
	            });
	        }
	        return {
	            ...node,
	            fields,
	        };
	    };
	}
	function parseSelections(source) {
	    return graphql_1.parse(`query { ${source} }`)
	        .definitions[0].selectionSet.selections;
	}
	exports.parseSelections = parseSelections;
	function hasMatchingFieldInDirectives({ directives, fieldNameToMatch, namedType, }) {
	    return Boolean(namedType.astNode &&
	        directives
	            .map(keyDirective => keyDirective.arguments &&
	            isStringValueNode(keyDirective.arguments[0].value)
	            ? {
	                typeName: namedType.astNode.name.value,
	                keyArgument: keyDirective.arguments[0].value.value,
	            }
	            : null)
	            .filter(isNotNullOrUndefined)
	            .flatMap(selection => parseSelections(selection.keyArgument))
	            .some(field => field.kind === graphql_1.Kind.FIELD && field.name.value === fieldNameToMatch));
	}
	exports.hasMatchingFieldInDirectives = hasMatchingFieldInDirectives;
	exports.logServiceAndType = (serviceName, typeName, fieldName) => `[${serviceName}] ${typeName}${fieldName ? `.${fieldName} -> ` : ' -> '}`;
	function logDirective(directiveName) {
	    return `[@${directiveName}] -> `;
	}
	exports.logDirective = logDirective;
	function errorWithCode(code, message, nodes) {
	    return new graphql_1.GraphQLError(message, nodes, undefined, undefined, undefined, undefined, {
	        code,
	    });
	}
	exports.errorWithCode = errorWithCode;
	function findTypesContainingFieldWithReturnType(schema, node) {
	    const returnType = graphql_1.getNamedType(node.type);
	    if (!graphql_1.isObjectType(returnType))
	        return [];
	    const containingTypes = [];
	    const types = schema.getTypeMap();
	    for (const selectionSetType of Object.values(types)) {
	        if (!graphql_1.isObjectType(selectionSetType))
	            continue;
	        const allFields = selectionSetType.getFields();
	        Object.values(allFields).forEach(field => {
	            const fieldReturnType = graphql_1.getNamedType(field.type);
	            if (fieldReturnType === returnType) {
	                containingTypes.push(fieldReturnType);
	            }
	        });
	    }
	    return containingTypes;
	}
	exports.findTypesContainingFieldWithReturnType = findTypesContainingFieldWithReturnType;
	function findFieldsThatReturnType({ schema, typeToFind, }) {
	    if (!graphql_1.isObjectType(typeToFind))
	        return [];
	    const fieldsThatReturnType = [];
	    const types = schema.getTypeMap();
	    for (const selectionSetType of Object.values(types)) {
	        if (!graphql_1.isObjectType(selectionSetType))
	            continue;
	        const fieldsOnNamedType = selectionSetType.getFields();
	        Object.values(fieldsOnNamedType).forEach(field => {
	            const fieldReturnType = graphql_1.getNamedType(field.type);
	            if (fieldReturnType === typeToFind) {
	                fieldsThatReturnType.push(field);
	            }
	        });
	    }
	    return fieldsThatReturnType;
	}
	exports.findFieldsThatReturnType = findFieldsThatReturnType;
	function selectionIncludesField({ selections, selectionSetType, typeToFind, fieldToFind, }) {
	    for (const selection of selections) {
	        const selectionName = selection.name.value;
	        if (selectionName === fieldToFind &&
	            graphql_1.isEqualType(selectionSetType, typeToFind))
	            return true;
	        const typeIncludesField = selectionName &&
	            Object.keys(selectionSetType.getFields()).includes(selectionName);
	        if (!selectionName || !typeIncludesField)
	            continue;
	        const returnType = graphql_1.getNamedType(selectionSetType.getFields()[selectionName].type);
	        if (!returnType || !graphql_1.isObjectType(returnType))
	            continue;
	        const subselections = selection.selectionSet && selection.selectionSet.selections;
	        if (subselections) {
	            const selectionDoesIncludeField = selectionIncludesField({
	                selectionSetType: returnType,
	                selections: subselections,
	                typeToFind,
	                fieldToFind,
	            });
	            if (selectionDoesIncludeField)
	                return true;
	        }
	    }
	    return false;
	}
	exports.selectionIncludesField = selectionIncludesField;
	function isTypeNodeAnEntity(node) {
	    let isEntity = false;
	    graphql_1.visit(node, {
	        Directive(directive) {
	            if (directive.name.value === 'key') {
	                isEntity = true;
	                return graphql_1.BREAK;
	            }
	        },
	    });
	    return isEntity;
	}
	exports.isTypeNodeAnEntity = isTypeNodeAnEntity;
	function diffTypeNodes(firstNode, secondNode) {
	    const fieldsDiff = Object.create(null);
	    const inputValuesDiff = Object.create(null);
	    const unionTypesDiff = Object.create(null);
	    const locationsDiff = new Set();
	    const argumentsDiff = Object.create(null);
	    const document = {
	        kind: graphql_1.Kind.DOCUMENT,
	        definitions: [firstNode, secondNode],
	    };
	    function fieldVisitor(node) {
	        const fieldName = node.name.value;
	        const type = graphql_1.print(node.type);
	        if (!fieldsDiff[fieldName]) {
	            fieldsDiff[fieldName] = [type];
	            return;
	        }
	        const fieldTypes = fieldsDiff[fieldName];
	        if (fieldTypes[0] === type) {
	            delete fieldsDiff[fieldName];
	        }
	        else {
	            fieldTypes.push(type);
	        }
	    }
	    function inputValueVisitor(node) {
	        const fieldName = node.name.value;
	        const type = graphql_1.print(node.type);
	        if (!inputValuesDiff[fieldName]) {
	            inputValuesDiff[fieldName] = [type];
	            return;
	        }
	        const inputValueTypes = inputValuesDiff[fieldName];
	        if (inputValueTypes[0] === type) {
	            delete inputValuesDiff[fieldName];
	        }
	        else {
	            inputValueTypes.push(type);
	        }
	    }
	    graphql_1.visit(document, {
	        FieldDefinition: fieldVisitor,
	        InputValueDefinition: inputValueVisitor,
	        UnionTypeDefinition(node) {
	            if (!node.types)
	                return graphql_1.BREAK;
	            for (const namedTypeNode of node.types) {
	                const name = namedTypeNode.name.value;
	                if (unionTypesDiff[name]) {
	                    delete unionTypesDiff[name];
	                }
	                else {
	                    unionTypesDiff[name] = true;
	                }
	            }
	        },
	        DirectiveDefinition(node) {
	            node.locations.forEach(location => {
	                const locationName = location.value;
	                if (locationsDiff.has(locationName)) {
	                    locationsDiff.delete(locationName);
	                }
	                else {
	                    locationsDiff.add(locationName);
	                }
	            });
	            if (!node.arguments)
	                return;
	            node.arguments.forEach(argument => {
	                const argumentName = argument.name.value;
	                const printedType = graphql_1.print(argument.type);
	                if (argumentsDiff[argumentName]) {
	                    if (printedType === argumentsDiff[argumentName][0]) {
	                        delete argumentsDiff[argumentName];
	                    }
	                    else {
	                        argumentsDiff[argumentName].push(printedType);
	                    }
	                }
	                else {
	                    argumentsDiff[argumentName] = [printedType];
	                }
	            });
	        },
	    });
	    const typeNameDiff = firstNode.name.value === secondNode.name.value
	        ? []
	        : [firstNode.name.value, secondNode.name.value];
	    const kindDiff = firstNode.kind === secondNode.kind ? [] : [firstNode.kind, secondNode.kind];
	    return {
	        name: typeNameDiff,
	        kind: kindDiff,
	        fields: fieldsDiff,
	        inputValues: inputValuesDiff,
	        unionTypes: unionTypesDiff,
	        locations: Array.from(locationsDiff),
	        args: argumentsDiff,
	    };
	}
	exports.diffTypeNodes = diffTypeNodes;
	function typeNodesAreEquivalent(firstNode, secondNode) {
	    const { name, kind, fields, inputValues, unionTypes, locations, args } = diffTypeNodes(firstNode, secondNode);
	    return (name.length === 0 &&
	        kind.length === 0 &&
	        Object.keys(fields).length === 0 &&
	        Object.keys(inputValues).length === 0 &&
	        Object.keys(unionTypes).length === 0 &&
	        locations.length === 0 &&
	        Object.keys(args).length === 0);
	}
	exports.typeNodesAreEquivalent = typeNodesAreEquivalent;
	exports.defKindToExtKind = {
	    [graphql_1.Kind.SCALAR_TYPE_DEFINITION]: graphql_1.Kind.SCALAR_TYPE_EXTENSION,
	    [graphql_1.Kind.OBJECT_TYPE_DEFINITION]: graphql_1.Kind.OBJECT_TYPE_EXTENSION,
	    [graphql_1.Kind.INTERFACE_TYPE_DEFINITION]: graphql_1.Kind.INTERFACE_TYPE_EXTENSION,
	    [graphql_1.Kind.UNION_TYPE_DEFINITION]: graphql_1.Kind.UNION_TYPE_EXTENSION,
	    [graphql_1.Kind.ENUM_TYPE_DEFINITION]: graphql_1.Kind.ENUM_TYPE_EXTENSION,
	    [graphql_1.Kind.INPUT_OBJECT_TYPE_DEFINITION]: graphql_1.Kind.INPUT_OBJECT_TYPE_EXTENSION,
	};
	function mapValues(object, callback) {
	    const result = Object.create(null);
	    for (const [key, value] of Object.entries(object)) {
	        result[key] = callback(value);
	    }
	    return result;
	}
	exports.mapValues = mapValues;
	function isNotNullOrUndefined(value) {
	    return value !== null && typeof value !== 'undefined';
	}
	exports.isNotNullOrUndefined = isNotNullOrUndefined;
	exports.executableDirectiveLocations = [
	    'QUERY',
	    'MUTATION',
	    'SUBSCRIPTION',
	    'FIELD',
	    'FRAGMENT_DEFINITION',
	    'FRAGMENT_SPREAD',
	    'INLINE_FRAGMENT',
	    'VARIABLE_DEFINITION',
	];
	function isFederationDirective(directive) {
	    return directives_1.default.some(({ name }) => name === directive.name);
	}
	exports.isFederationDirective = isFederationDirective;
	exports.reservedRootFields = ['_service', '_entities'];
	exports.defaultRootOperationNameLookup = {
	    query: 'Query',
	    mutation: 'Mutation',
	    subscription: 'Subscription',
	};
	function getFederationMetadata(obj) {
	    var _a, _b, _c;
	    if (typeof obj === "undefined")
	        return undefined;
	    else if (graphql_1.isNamedType(obj))
	        return (_a = obj.extensions) === null || _a === void 0 ? void 0 : _a.federation;
	    else if (graphql_1.isDirective(obj))
	        return (_b = obj.extensions) === null || _b === void 0 ? void 0 : _b.federation;
	    else
	        return (_c = obj.extensions) === null || _c === void 0 ? void 0 : _c.federation;
	}
	exports.getFederationMetadata = getFederationMetadata;

	});

	var uniqueTypeNamesWithFields = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.UniqueTypeNamesWithFields = exports.existedTypeNameMessage = exports.duplicateTypeNameMessage = void 0;


	function duplicateTypeNameMessage(typeName) {
	    return `There can be only one type named "${typeName}".`;
	}
	exports.duplicateTypeNameMessage = duplicateTypeNameMessage;
	function existedTypeNameMessage(typeName) {
	    return `Type "${typeName}" already exists in the schema. It cannot also be defined in this type definition.`;
	}
	exports.existedTypeNameMessage = existedTypeNameMessage;
	function UniqueTypeNamesWithFields(context) {
	    const knownTypes = Object.create(null);
	    const schema = context.getSchema();
	    return {
	        ScalarTypeDefinition: checkTypeName,
	        ObjectTypeDefinition: checkTypeName,
	        InterfaceTypeDefinition: checkTypeName,
	        UnionTypeDefinition: checkTypeName,
	        EnumTypeDefinition: checkTypeName,
	        InputObjectTypeDefinition: checkTypeName,
	    };
	    function checkTypeName(node) {
	        const typeName = node.name.value;
	        const typeFromSchema = schema && schema.getType(typeName);
	        const typeNodeFromSchema = typeFromSchema &&
	            typeFromSchema.astNode;
	        const typeNodeFromDefs = knownTypes[typeName];
	        const duplicateTypeNode = typeNodeFromSchema || typeNodeFromDefs;
	        if (duplicateTypeNode) {
	            const possibleErrors = [];
	            const { kind, fields, inputValues } = utils$1.diffTypeNodes(node, duplicateTypeNode);
	            const fieldsDiff = Object.entries(fields);
	            if (kind.length > 0) {
	                context.reportError(utils$1.errorWithCode('VALUE_TYPE_KIND_MISMATCH', `${utils$1.logServiceAndType(duplicateTypeNode.serviceName, typeName)}Found kind mismatch on expected value type belonging to services \`${duplicateTypeNode.serviceName}\` and \`${node.serviceName}\`. \`${typeName}\` is defined as both a \`${kind[0]}\` and a \`${kind[1]}\`. In order to define \`${typeName}\` in multiple places, the kinds must be identical.`, [node, duplicateTypeNode]));
	                return;
	            }
	            const typesHaveSameFieldShape = fieldsDiff.length === 0 ||
	                fieldsDiff.every(([fieldName, types]) => {
	                    if (types.length === 2) {
	                        possibleErrors.push(utils$1.errorWithCode('VALUE_TYPE_FIELD_TYPE_MISMATCH', `${utils$1.logServiceAndType(duplicateTypeNode.serviceName, typeName, fieldName)}A field was defined differently in different services. \`${duplicateTypeNode.serviceName}\` and \`${node.serviceName}\` define \`${typeName}.${fieldName}\` as a ${types[1]} and ${types[0]} respectively. In order to define \`${typeName}\` in multiple places, the fields and their types must be identical.`, [node, duplicateTypeNode]));
	                        return true;
	                    }
	                    return false;
	                });
	            const inputValuesDiff = Object.entries(inputValues);
	            const typesHaveSameInputValuesShape = inputValuesDiff.length === 0 ||
	                inputValuesDiff.every(([name, types]) => {
	                    if (types.length === 2) {
	                        possibleErrors.push(utils$1.errorWithCode('VALUE_TYPE_INPUT_VALUE_MISMATCH', `${utils$1.logServiceAndType(duplicateTypeNode.serviceName, typeName)}A field's input type (\`${name}\`) was defined differently in different services. \`${duplicateTypeNode.serviceName}\` and \`${node.serviceName}\` define \`${name}\` as a ${types[1]} and ${types[0]} respectively. In order to define \`${typeName}\` in multiple places, the input values and their types must be identical.`, [node, duplicateTypeNode]));
	                        return true;
	                    }
	                    return false;
	                });
	            if (typesHaveSameFieldShape && typesHaveSameInputValuesShape) {
	                possibleErrors.forEach(error => context.reportError(error));
	                if (utils$1.isTypeNodeAnEntity(node) || utils$1.isTypeNodeAnEntity(duplicateTypeNode)) {
	                    const entityNode = utils$1.isTypeNodeAnEntity(duplicateTypeNode)
	                        ? duplicateTypeNode
	                        : node;
	                    context.reportError(utils$1.errorWithCode('VALUE_TYPE_NO_ENTITY', `${utils$1.logServiceAndType(entityNode.serviceName, typeName)}Value types cannot be entities (using the \`@key\` directive). Please ensure that the \`${typeName}\` type is extended properly or remove the \`@key\` directive if this is not an entity.`, [node, duplicateTypeNode]));
	                }
	                return false;
	            }
	        }
	        if (typeFromSchema) {
	            context.reportError(new graphql_1.GraphQLError(existedTypeNameMessage(typeName), node.name));
	            return;
	        }
	        if (knownTypes[typeName]) {
	            context.reportError(new graphql_1.GraphQLError(duplicateTypeNameMessage(typeName), [
	                knownTypes[typeName],
	                node.name,
	            ]));
	        }
	        else {
	            knownTypes[typeName] = node;
	        }
	        return false;
	    }
	}
	exports.UniqueTypeNamesWithFields = UniqueTypeNamesWithFields;

	});

	var matchingEnums = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MatchingEnums = void 0;



	function isEnumDefinition(node) {
	    return node.kind === graphql_1.Kind.ENUM_TYPE_DEFINITION;
	}
	function MatchingEnums(context) {
	    const { definitions } = context.getDocument();
	    let definitionsByName = definitions.reduce((typeToDefinitionsMap, node) => {
	        const name = node.name.value;
	        if (typeToDefinitionsMap[name]) {
	            typeToDefinitionsMap[name].push(node);
	        }
	        else {
	            typeToDefinitionsMap[name] = [node];
	        }
	        return typeToDefinitionsMap;
	    }, {});
	    for (const [name, definitions] of Object.entries(definitionsByName)) {
	        if (definitions.every(isEnumDefinition)) {
	            let simpleEnumDefs = [];
	            for (const { values, serviceName, } of definitions) {
	                if (serviceName && values)
	                    simpleEnumDefs.push({
	                        serviceName,
	                        values: values.map((enumValue) => enumValue.name.value),
	                    });
	            }
	            for (const definition of simpleEnumDefs) {
	                definition.values = definition.values.sort();
	            }
	            let matchingEnumGroups = {};
	            for (const definition of simpleEnumDefs) {
	                const key = definition.values.join();
	                if (matchingEnumGroups[key]) {
	                    matchingEnumGroups[key].push(definition.serviceName);
	                }
	                else {
	                    matchingEnumGroups[key] = [definition.serviceName];
	                }
	            }
	            if (Object.keys(matchingEnumGroups).length > 1) {
	                context.reportError(utils$1.errorWithCode('ENUM_MISMATCH', `The \`${name}\` enum does not have identical values in all services. Groups of services with identical values are: ${Object.values(matchingEnumGroups)
                    .map(serviceNames => `[${serviceNames.join(', ')}]`)
                    .join(', ')}`));
	            }
	        }
	        else if (definitions.some(isEnumDefinition)) {
	            const servicesWithEnum = definitions
	                .filter(isEnumDefinition)
	                .map(definition => definition.serviceName)
	                .filter(util_1.isString);
	            const servicesWithoutEnum = definitions
	                .filter(d => !isEnumDefinition(d))
	                .map(d => d.serviceName)
	                .filter(util_1.isString);
	            context.reportError(utils$1.errorWithCode('ENUM_MISMATCH_TYPE', utils$1.logServiceAndType(servicesWithEnum[0], name) +
	                `${name} is an enum in [${servicesWithEnum.join(', ')}], but not in [${servicesWithoutEnum.join(', ')}]`));
	        }
	    }
	    return {};
	}
	exports.MatchingEnums = MatchingEnums;

	});

	var possibleTypeExtensions = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.PossibleTypeExtensions = void 0;


	function PossibleTypeExtensions(context) {
	    const schema = context.getSchema();
	    const definedTypes = Object.create(null);
	    for (const def of context.getDocument().definitions) {
	        if (graphql_1.isTypeDefinitionNode(def)) {
	            definedTypes[def.name.value] = def;
	        }
	    }
	    const checkExtension = (node) => {
	        const typeName = node.name.value;
	        const defNode = definedTypes[typeName];
	        const existingType = schema && schema.getType(typeName);
	        const serviceName = node.serviceName;
	        if (!serviceName)
	            return;
	        if (defNode) {
	            const expectedKind = utils$1.defKindToExtKind[defNode.kind];
	            const baseKind = defNode.kind;
	            if (expectedKind !== node.kind) {
	                context.reportError(utils$1.errorWithCode('EXTENSION_OF_WRONG_KIND', utils$1.logServiceAndType(serviceName, typeName) +
	                    `\`${typeName}\` was originally defined as a ${baseKind} and can only be extended by a ${expectedKind}. ${serviceName} defines ${typeName} as a ${node.kind}`));
	            }
	        }
	        else if (existingType) {
	            const expectedKind = typeToExtKind(existingType);
	            const baseKind = typeToKind(existingType);
	            if (expectedKind !== node.kind) {
	                context.reportError(utils$1.errorWithCode('EXTENSION_OF_WRONG_KIND', utils$1.logServiceAndType(serviceName, typeName) +
	                    `\`${typeName}\` was originally defined as a ${baseKind} and can only be extended by a ${expectedKind}. ${serviceName} defines ${typeName} as a ${node.kind}`));
	            }
	        }
	        else {
	            context.reportError(utils$1.errorWithCode('EXTENSION_WITH_NO_BASE', utils$1.logServiceAndType(serviceName, typeName) +
	                `\`${typeName}\` is an extension type, but \`${typeName}\` is not defined in any service`));
	        }
	    };
	    return {
	        ObjectTypeExtension: checkExtension,
	        InterfaceTypeExtension: checkExtension,
	    };
	}
	exports.PossibleTypeExtensions = PossibleTypeExtensions;
	function typeToExtKind(type) {
	    if (graphql_1.isScalarType(type)) {
	        return graphql_1.Kind.SCALAR_TYPE_EXTENSION;
	    }
	    else if (graphql_1.isObjectType(type)) {
	        return graphql_1.Kind.OBJECT_TYPE_EXTENSION;
	    }
	    else if (graphql_1.isInterfaceType(type)) {
	        return graphql_1.Kind.INTERFACE_TYPE_EXTENSION;
	    }
	    else if (graphql_1.isUnionType(type)) {
	        return graphql_1.Kind.UNION_TYPE_EXTENSION;
	    }
	    else if (graphql_1.isEnumType(type)) {
	        return graphql_1.Kind.ENUM_TYPE_EXTENSION;
	    }
	    else if (graphql_1.isInputObjectType(type)) {
	        return graphql_1.Kind.INPUT_OBJECT_TYPE_EXTENSION;
	    }
	    return null;
	}
	function typeToKind(type) {
	    if (graphql_1.isScalarType(type)) {
	        return graphql_1.Kind.SCALAR_TYPE_DEFINITION;
	    }
	    else if (graphql_1.isObjectType(type)) {
	        return graphql_1.Kind.OBJECT_TYPE_DEFINITION;
	    }
	    else if (graphql_1.isInterfaceType(type)) {
	        return graphql_1.Kind.INTERFACE_TYPE_DEFINITION;
	    }
	    else if (graphql_1.isUnionType(type)) {
	        return graphql_1.Kind.UNION_TYPE_DEFINITION;
	    }
	    else if (graphql_1.isEnumType(type)) {
	        return graphql_1.Kind.ENUM_TYPE_DEFINITION;
	    }
	    else if (graphql_1.isInputObjectType(type)) {
	        return graphql_1.Kind.INPUT_OBJECT_TYPE_DEFINITION;
	    }
	    return null;
	}

	});

	var uniqueFieldDefinitionNames = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.UniqueFieldDefinitionNames = exports.existedFieldDefinitionNameMessage = exports.duplicateFieldDefinitionNameMessage = void 0;


	function duplicateFieldDefinitionNameMessage(typeName, fieldName) {
	    return `Field "${typeName}.${fieldName}" can only be defined once.`;
	}
	exports.duplicateFieldDefinitionNameMessage = duplicateFieldDefinitionNameMessage;
	function existedFieldDefinitionNameMessage(typeName, fieldName, serviceName) {
	    return `${utils$1.logServiceAndType(serviceName, typeName, fieldName)}Field "${typeName}.${fieldName}" already exists in the schema. It cannot also be defined in this type extension. If this is meant to be an external field, add the \`@external\` directive.`;
	}
	exports.existedFieldDefinitionNameMessage = existedFieldDefinitionNameMessage;
	function UniqueFieldDefinitionNames(context) {
	    const schema = context.getSchema();
	    const existingTypeMap = schema
	        ? schema.getTypeMap()
	        : Object.create(null);
	    const knownFieldNames = Object.create(null);
	    const possibleValueTypes = Object.create(null);
	    return {
	        InputObjectTypeExtension: checkFieldUniqueness,
	        InterfaceTypeExtension: checkFieldUniqueness,
	        ObjectTypeExtension: checkFieldUniqueness,
	        InputObjectTypeDefinition: checkFieldUniquenessExcludingValueTypes,
	        InterfaceTypeDefinition: checkFieldUniquenessExcludingValueTypes,
	        ObjectTypeDefinition: checkFieldUniquenessExcludingValueTypes,
	    };
	    function checkFieldUniqueness(node) {
	        const typeName = node.name.value;
	        if (!knownFieldNames[typeName]) {
	            knownFieldNames[typeName] = Object.create(null);
	        }
	        if (!node.fields) {
	            return false;
	        }
	        const fieldNames = knownFieldNames[typeName];
	        for (const fieldDef of node.fields) {
	            const fieldName = fieldDef.name.value;
	            if (hasField(existingTypeMap[typeName], fieldName)) {
	                context.reportError(new graphql_1.GraphQLError(existedFieldDefinitionNameMessage(typeName, fieldName, existingTypeMap[typeName].astNode.serviceName), fieldDef.name));
	            }
	            else if (fieldNames[fieldName]) {
	                context.reportError(new graphql_1.GraphQLError(duplicateFieldDefinitionNameMessage(typeName, fieldName), [fieldNames[fieldName], fieldDef.name]));
	            }
	            else {
	                fieldNames[fieldName] = fieldDef.name;
	            }
	        }
	        return false;
	    }
	    function checkFieldUniquenessExcludingValueTypes(node) {
	        const typeName = node.name.value;
	        const valueTypeFromSchema = existingTypeMap[typeName] &&
	            existingTypeMap[typeName].astNode;
	        const duplicateTypeNode = valueTypeFromSchema || possibleValueTypes[node.name.value];
	        if (duplicateTypeNode) {
	            const { fields, inputValues } = utils$1.diffTypeNodes(node, duplicateTypeNode);
	            if (Object.values(fields).every(diffEntry => diffEntry.length === 2)) {
	                return false;
	            }
	            const inputValuesTypes = Object.values(inputValues);
	            if (inputValuesTypes.length > 0 &&
	                inputValuesTypes.every((diffEntry) => diffEntry.length === 2)) {
	                return false;
	            }
	        }
	        else {
	            possibleValueTypes[node.name.value] = node;
	        }
	        if (!knownFieldNames[typeName]) {
	            knownFieldNames[typeName] = Object.create(null);
	        }
	        if (!node.fields) {
	            return false;
	        }
	        const fieldNames = knownFieldNames[typeName];
	        for (const fieldDef of node.fields) {
	            const fieldName = fieldDef.name.value;
	            if (hasField(existingTypeMap[typeName], fieldName)) {
	                context.reportError(new graphql_1.GraphQLError(existedFieldDefinitionNameMessage(typeName, fieldName, existingTypeMap[typeName].astNode.serviceName), fieldDef.name));
	            }
	            else if (fieldNames[fieldName]) {
	                context.reportError(new graphql_1.GraphQLError(duplicateFieldDefinitionNameMessage(typeName, fieldName), [fieldNames[fieldName], fieldDef.name]));
	            }
	            else {
	                fieldNames[fieldName] = fieldDef.name;
	            }
	        }
	        return false;
	    }
	}
	exports.UniqueFieldDefinitionNames = UniqueFieldDefinitionNames;
	function hasField(type, fieldName) {
	    if (graphql_1.isObjectType(type) || graphql_1.isInterfaceType(type) || graphql_1.isInputObjectType(type)) {
	        return Boolean(type.getFields()[fieldName]);
	    }
	    return false;
	}

	});

	/**
	 * lodash (Custom Build) <https://lodash.com/>
	 * Build: `lodash modularize exports="npm" -o ./`
	 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
	 * Released under MIT license <https://lodash.com/license>
	 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
	 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
	 */

	var lodash_xorby = createCommonjsModule(function (module, exports) {
	/** Used as the size to enable large array optimizations. */
	var LARGE_ARRAY_SIZE = 200;

	/** Used as the `TypeError` message for "Functions" methods. */
	var FUNC_ERROR_TEXT = 'Expected a function';

	/** Used to stand-in for `undefined` hash values. */
	var HASH_UNDEFINED = '__lodash_hash_undefined__';

	/** Used to compose bitmasks for comparison styles. */
	var UNORDERED_COMPARE_FLAG = 1,
	    PARTIAL_COMPARE_FLAG = 2;

	/** Used as references for various `Number` constants. */
	var INFINITY = 1 / 0,
	    MAX_SAFE_INTEGER = 9007199254740991;

	/** `Object#toString` result references. */
	var argsTag = '[object Arguments]',
	    arrayTag = '[object Array]',
	    boolTag = '[object Boolean]',
	    dateTag = '[object Date]',
	    errorTag = '[object Error]',
	    funcTag = '[object Function]',
	    genTag = '[object GeneratorFunction]',
	    mapTag = '[object Map]',
	    numberTag = '[object Number]',
	    objectTag = '[object Object]',
	    promiseTag = '[object Promise]',
	    regexpTag = '[object RegExp]',
	    setTag = '[object Set]',
	    stringTag = '[object String]',
	    symbolTag = '[object Symbol]',
	    weakMapTag = '[object WeakMap]';

	var arrayBufferTag = '[object ArrayBuffer]',
	    dataViewTag = '[object DataView]',
	    float32Tag = '[object Float32Array]',
	    float64Tag = '[object Float64Array]',
	    int8Tag = '[object Int8Array]',
	    int16Tag = '[object Int16Array]',
	    int32Tag = '[object Int32Array]',
	    uint8Tag = '[object Uint8Array]',
	    uint8ClampedTag = '[object Uint8ClampedArray]',
	    uint16Tag = '[object Uint16Array]',
	    uint32Tag = '[object Uint32Array]';

	/** Used to match property names within property paths. */
	var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
	    reIsPlainProp = /^\w*$/,
	    reLeadingDot = /^\./,
	    rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

	/**
	 * Used to match `RegExp`
	 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
	 */
	var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

	/** Used to match backslashes in property paths. */
	var reEscapeChar = /\\(\\)?/g;

	/** Used to detect host constructors (Safari). */
	var reIsHostCtor = /^\[object .+?Constructor\]$/;

	/** Used to detect unsigned integer values. */
	var reIsUint = /^(?:0|[1-9]\d*)$/;

	/** Used to identify `toStringTag` values of typed arrays. */
	var typedArrayTags = {};
	typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
	typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
	typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
	typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
	typedArrayTags[uint32Tag] = true;
	typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
	typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
	typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
	typedArrayTags[errorTag] = typedArrayTags[funcTag] =
	typedArrayTags[mapTag] = typedArrayTags[numberTag] =
	typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
	typedArrayTags[setTag] = typedArrayTags[stringTag] =
	typedArrayTags[weakMapTag] = false;

	/** Detect free variable `global` from Node.js. */
	var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

	/** Detect free variable `self`. */
	var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

	/** Used as a reference to the global object. */
	var root = freeGlobal || freeSelf || Function('return this')();

	/** Detect free variable `exports`. */
	var freeExports =  exports && !exports.nodeType && exports;

	/** Detect free variable `module`. */
	var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

	/** Detect the popular CommonJS extension `module.exports`. */
	var moduleExports = freeModule && freeModule.exports === freeExports;

	/** Detect free variable `process` from Node.js. */
	var freeProcess = moduleExports && freeGlobal.process;

	/** Used to access faster Node.js helpers. */
	var nodeUtil = (function() {
	  try {
	    return freeProcess && freeProcess.binding('util');
	  } catch (e) {}
	}());

	/* Node.js helper references. */
	var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

	/**
	 * A faster alternative to `Function#apply`, this function invokes `func`
	 * with the `this` binding of `thisArg` and the arguments of `args`.
	 *
	 * @private
	 * @param {Function} func The function to invoke.
	 * @param {*} thisArg The `this` binding of `func`.
	 * @param {Array} args The arguments to invoke `func` with.
	 * @returns {*} Returns the result of `func`.
	 */
	function apply(func, thisArg, args) {
	  switch (args.length) {
	    case 0: return func.call(thisArg);
	    case 1: return func.call(thisArg, args[0]);
	    case 2: return func.call(thisArg, args[0], args[1]);
	    case 3: return func.call(thisArg, args[0], args[1], args[2]);
	  }
	  return func.apply(thisArg, args);
	}

	/**
	 * A specialized version of `_.filter` for arrays without support for
	 * iteratee shorthands.
	 *
	 * @private
	 * @param {Array} [array] The array to iterate over.
	 * @param {Function} predicate The function invoked per iteration.
	 * @returns {Array} Returns the new filtered array.
	 */
	function arrayFilter(array, predicate) {
	  var index = -1,
	      length = array ? array.length : 0,
	      resIndex = 0,
	      result = [];

	  while (++index < length) {
	    var value = array[index];
	    if (predicate(value, index, array)) {
	      result[resIndex++] = value;
	    }
	  }
	  return result;
	}

	/**
	 * A specialized version of `_.includes` for arrays without support for
	 * specifying an index to search from.
	 *
	 * @private
	 * @param {Array} [array] The array to inspect.
	 * @param {*} target The value to search for.
	 * @returns {boolean} Returns `true` if `target` is found, else `false`.
	 */
	function arrayIncludes(array, value) {
	  var length = array ? array.length : 0;
	  return !!length && baseIndexOf(array, value, 0) > -1;
	}

	/**
	 * This function is like `arrayIncludes` except that it accepts a comparator.
	 *
	 * @private
	 * @param {Array} [array] The array to inspect.
	 * @param {*} target The value to search for.
	 * @param {Function} comparator The comparator invoked per element.
	 * @returns {boolean} Returns `true` if `target` is found, else `false`.
	 */
	function arrayIncludesWith(array, value, comparator) {
	  var index = -1,
	      length = array ? array.length : 0;

	  while (++index < length) {
	    if (comparator(value, array[index])) {
	      return true;
	    }
	  }
	  return false;
	}

	/**
	 * A specialized version of `_.map` for arrays without support for iteratee
	 * shorthands.
	 *
	 * @private
	 * @param {Array} [array] The array to iterate over.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Array} Returns the new mapped array.
	 */
	function arrayMap(array, iteratee) {
	  var index = -1,
	      length = array ? array.length : 0,
	      result = Array(length);

	  while (++index < length) {
	    result[index] = iteratee(array[index], index, array);
	  }
	  return result;
	}

	/**
	 * Appends the elements of `values` to `array`.
	 *
	 * @private
	 * @param {Array} array The array to modify.
	 * @param {Array} values The values to append.
	 * @returns {Array} Returns `array`.
	 */
	function arrayPush(array, values) {
	  var index = -1,
	      length = values.length,
	      offset = array.length;

	  while (++index < length) {
	    array[offset + index] = values[index];
	  }
	  return array;
	}

	/**
	 * A specialized version of `_.some` for arrays without support for iteratee
	 * shorthands.
	 *
	 * @private
	 * @param {Array} [array] The array to iterate over.
	 * @param {Function} predicate The function invoked per iteration.
	 * @returns {boolean} Returns `true` if any element passes the predicate check,
	 *  else `false`.
	 */
	function arraySome(array, predicate) {
	  var index = -1,
	      length = array ? array.length : 0;

	  while (++index < length) {
	    if (predicate(array[index], index, array)) {
	      return true;
	    }
	  }
	  return false;
	}

	/**
	 * The base implementation of `_.findIndex` and `_.findLastIndex` without
	 * support for iteratee shorthands.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {Function} predicate The function invoked per iteration.
	 * @param {number} fromIndex The index to search from.
	 * @param {boolean} [fromRight] Specify iterating from right to left.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function baseFindIndex(array, predicate, fromIndex, fromRight) {
	  var length = array.length,
	      index = fromIndex + (fromRight ? 1 : -1);

	  while ((fromRight ? index-- : ++index < length)) {
	    if (predicate(array[index], index, array)) {
	      return index;
	    }
	  }
	  return -1;
	}

	/**
	 * The base implementation of `_.indexOf` without `fromIndex` bounds checks.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {*} value The value to search for.
	 * @param {number} fromIndex The index to search from.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function baseIndexOf(array, value, fromIndex) {
	  if (value !== value) {
	    return baseFindIndex(array, baseIsNaN, fromIndex);
	  }
	  var index = fromIndex - 1,
	      length = array.length;

	  while (++index < length) {
	    if (array[index] === value) {
	      return index;
	    }
	  }
	  return -1;
	}

	/**
	 * The base implementation of `_.isNaN` without support for number objects.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
	 */
	function baseIsNaN(value) {
	  return value !== value;
	}

	/**
	 * The base implementation of `_.property` without support for deep paths.
	 *
	 * @private
	 * @param {string} key The key of the property to get.
	 * @returns {Function} Returns the new accessor function.
	 */
	function baseProperty(key) {
	  return function(object) {
	    return object == null ? undefined : object[key];
	  };
	}

	/**
	 * The base implementation of `_.times` without support for iteratee shorthands
	 * or max array length checks.
	 *
	 * @private
	 * @param {number} n The number of times to invoke `iteratee`.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Array} Returns the array of results.
	 */
	function baseTimes(n, iteratee) {
	  var index = -1,
	      result = Array(n);

	  while (++index < n) {
	    result[index] = iteratee(index);
	  }
	  return result;
	}

	/**
	 * The base implementation of `_.unary` without support for storing metadata.
	 *
	 * @private
	 * @param {Function} func The function to cap arguments for.
	 * @returns {Function} Returns the new capped function.
	 */
	function baseUnary(func) {
	  return function(value) {
	    return func(value);
	  };
	}

	/**
	 * Checks if a cache value for `key` exists.
	 *
	 * @private
	 * @param {Object} cache The cache to query.
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function cacheHas(cache, key) {
	  return cache.has(key);
	}

	/**
	 * Gets the value at `key` of `object`.
	 *
	 * @private
	 * @param {Object} [object] The object to query.
	 * @param {string} key The key of the property to get.
	 * @returns {*} Returns the property value.
	 */
	function getValue(object, key) {
	  return object == null ? undefined : object[key];
	}

	/**
	 * Checks if `value` is a host object in IE < 9.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
	 */
	function isHostObject(value) {
	  // Many host objects are `Object` objects that can coerce to strings
	  // despite having improperly defined `toString` methods.
	  var result = false;
	  if (value != null && typeof value.toString != 'function') {
	    try {
	      result = !!(value + '');
	    } catch (e) {}
	  }
	  return result;
	}

	/**
	 * Converts `map` to its key-value pairs.
	 *
	 * @private
	 * @param {Object} map The map to convert.
	 * @returns {Array} Returns the key-value pairs.
	 */
	function mapToArray(map) {
	  var index = -1,
	      result = Array(map.size);

	  map.forEach(function(value, key) {
	    result[++index] = [key, value];
	  });
	  return result;
	}

	/**
	 * Creates a unary function that invokes `func` with its argument transformed.
	 *
	 * @private
	 * @param {Function} func The function to wrap.
	 * @param {Function} transform The argument transform.
	 * @returns {Function} Returns the new function.
	 */
	function overArg(func, transform) {
	  return function(arg) {
	    return func(transform(arg));
	  };
	}

	/**
	 * Converts `set` to an array of its values.
	 *
	 * @private
	 * @param {Object} set The set to convert.
	 * @returns {Array} Returns the values.
	 */
	function setToArray(set) {
	  var index = -1,
	      result = Array(set.size);

	  set.forEach(function(value) {
	    result[++index] = value;
	  });
	  return result;
	}

	/** Used for built-in method references. */
	var arrayProto = Array.prototype,
	    funcProto = Function.prototype,
	    objectProto = Object.prototype;

	/** Used to detect overreaching core-js shims. */
	var coreJsData = root['__core-js_shared__'];

	/** Used to detect methods masquerading as native. */
	var maskSrcKey = (function() {
	  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
	  return uid ? ('Symbol(src)_1.' + uid) : '';
	}());

	/** Used to resolve the decompiled source of functions. */
	var funcToString = funcProto.toString;

	/** Used to check objects for own properties. */
	var hasOwnProperty = objectProto.hasOwnProperty;

	/**
	 * Used to resolve the
	 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
	 * of values.
	 */
	var objectToString = objectProto.toString;

	/** Used to detect if a method is native. */
	var reIsNative = RegExp('^' +
	  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
	  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
	);

	/** Built-in value references. */
	var Symbol = root.Symbol,
	    Uint8Array = root.Uint8Array,
	    propertyIsEnumerable = objectProto.propertyIsEnumerable,
	    splice = arrayProto.splice;

	/* Built-in method references for those with the same name as other `lodash` methods. */
	var nativeKeys = overArg(Object.keys, Object),
	    nativeMax = Math.max;

	/* Built-in method references that are verified to be native. */
	var DataView = getNative(root, 'DataView'),
	    Map = getNative(root, 'Map'),
	    Promise = getNative(root, 'Promise'),
	    Set = getNative(root, 'Set'),
	    WeakMap = getNative(root, 'WeakMap'),
	    nativeCreate = getNative(Object, 'create');

	/** Used to detect maps, sets, and weakmaps. */
	var dataViewCtorString = toSource(DataView),
	    mapCtorString = toSource(Map),
	    promiseCtorString = toSource(Promise),
	    setCtorString = toSource(Set),
	    weakMapCtorString = toSource(WeakMap);

	/** Used to convert symbols to primitives and strings. */
	var symbolProto = Symbol ? Symbol.prototype : undefined,
	    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined,
	    symbolToString = symbolProto ? symbolProto.toString : undefined;

	/**
	 * Creates a hash object.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function Hash(entries) {
	  var index = -1,
	      length = entries ? entries.length : 0;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the hash.
	 *
	 * @private
	 * @name clear
	 * @memberOf Hash
	 */
	function hashClear() {
	  this.__data__ = nativeCreate ? nativeCreate(null) : {};
	}

	/**
	 * Removes `key` and its value from the hash.
	 *
	 * @private
	 * @name delete
	 * @memberOf Hash
	 * @param {Object} hash The hash to modify.
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function hashDelete(key) {
	  return this.has(key) && delete this.__data__[key];
	}

	/**
	 * Gets the hash value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf Hash
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function hashGet(key) {
	  var data = this.__data__;
	  if (nativeCreate) {
	    var result = data[key];
	    return result === HASH_UNDEFINED ? undefined : result;
	  }
	  return hasOwnProperty.call(data, key) ? data[key] : undefined;
	}

	/**
	 * Checks if a hash value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf Hash
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function hashHas(key) {
	  var data = this.__data__;
	  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
	}

	/**
	 * Sets the hash `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf Hash
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the hash instance.
	 */
	function hashSet(key, value) {
	  var data = this.__data__;
	  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
	  return this;
	}

	// Add methods to `Hash`.
	Hash.prototype.clear = hashClear;
	Hash.prototype['delete'] = hashDelete;
	Hash.prototype.get = hashGet;
	Hash.prototype.has = hashHas;
	Hash.prototype.set = hashSet;

	/**
	 * Creates an list cache object.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function ListCache(entries) {
	  var index = -1,
	      length = entries ? entries.length : 0;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the list cache.
	 *
	 * @private
	 * @name clear
	 * @memberOf ListCache
	 */
	function listCacheClear() {
	  this.__data__ = [];
	}

	/**
	 * Removes `key` and its value from the list cache.
	 *
	 * @private
	 * @name delete
	 * @memberOf ListCache
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function listCacheDelete(key) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  if (index < 0) {
	    return false;
	  }
	  var lastIndex = data.length - 1;
	  if (index == lastIndex) {
	    data.pop();
	  } else {
	    splice.call(data, index, 1);
	  }
	  return true;
	}

	/**
	 * Gets the list cache value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf ListCache
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function listCacheGet(key) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  return index < 0 ? undefined : data[index][1];
	}

	/**
	 * Checks if a list cache value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf ListCache
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function listCacheHas(key) {
	  return assocIndexOf(this.__data__, key) > -1;
	}

	/**
	 * Sets the list cache `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf ListCache
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the list cache instance.
	 */
	function listCacheSet(key, value) {
	  var data = this.__data__,
	      index = assocIndexOf(data, key);

	  if (index < 0) {
	    data.push([key, value]);
	  } else {
	    data[index][1] = value;
	  }
	  return this;
	}

	// Add methods to `ListCache`.
	ListCache.prototype.clear = listCacheClear;
	ListCache.prototype['delete'] = listCacheDelete;
	ListCache.prototype.get = listCacheGet;
	ListCache.prototype.has = listCacheHas;
	ListCache.prototype.set = listCacheSet;

	/**
	 * Creates a map cache object to store key-value pairs.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function MapCache(entries) {
	  var index = -1,
	      length = entries ? entries.length : 0;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this.set(entry[0], entry[1]);
	  }
	}

	/**
	 * Removes all key-value entries from the map.
	 *
	 * @private
	 * @name clear
	 * @memberOf MapCache
	 */
	function mapCacheClear() {
	  this.__data__ = {
	    'hash': new Hash,
	    'map': new (Map || ListCache),
	    'string': new Hash
	  };
	}

	/**
	 * Removes `key` and its value from the map.
	 *
	 * @private
	 * @name delete
	 * @memberOf MapCache
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function mapCacheDelete(key) {
	  return getMapData(this, key)['delete'](key);
	}

	/**
	 * Gets the map value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf MapCache
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function mapCacheGet(key) {
	  return getMapData(this, key).get(key);
	}

	/**
	 * Checks if a map value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf MapCache
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function mapCacheHas(key) {
	  return getMapData(this, key).has(key);
	}

	/**
	 * Sets the map `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf MapCache
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the map cache instance.
	 */
	function mapCacheSet(key, value) {
	  getMapData(this, key).set(key, value);
	  return this;
	}

	// Add methods to `MapCache`.
	MapCache.prototype.clear = mapCacheClear;
	MapCache.prototype['delete'] = mapCacheDelete;
	MapCache.prototype.get = mapCacheGet;
	MapCache.prototype.has = mapCacheHas;
	MapCache.prototype.set = mapCacheSet;

	/**
	 *
	 * Creates an array cache object to store unique values.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [values] The values to cache.
	 */
	function SetCache(values) {
	  var index = -1,
	      length = values ? values.length : 0;

	  this.__data__ = new MapCache;
	  while (++index < length) {
	    this.add(values[index]);
	  }
	}

	/**
	 * Adds `value` to the array cache.
	 *
	 * @private
	 * @name add
	 * @memberOf SetCache
	 * @alias push
	 * @param {*} value The value to cache.
	 * @returns {Object} Returns the cache instance.
	 */
	function setCacheAdd(value) {
	  this.__data__.set(value, HASH_UNDEFINED);
	  return this;
	}

	/**
	 * Checks if `value` is in the array cache.
	 *
	 * @private
	 * @name has
	 * @memberOf SetCache
	 * @param {*} value The value to search for.
	 * @returns {number} Returns `true` if `value` is found, else `false`.
	 */
	function setCacheHas(value) {
	  return this.__data__.has(value);
	}

	// Add methods to `SetCache`.
	SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
	SetCache.prototype.has = setCacheHas;

	/**
	 * Creates a stack cache object to store key-value pairs.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function Stack(entries) {
	  this.__data__ = new ListCache(entries);
	}

	/**
	 * Removes all key-value entries from the stack.
	 *
	 * @private
	 * @name clear
	 * @memberOf Stack
	 */
	function stackClear() {
	  this.__data__ = new ListCache;
	}

	/**
	 * Removes `key` and its value from the stack.
	 *
	 * @private
	 * @name delete
	 * @memberOf Stack
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function stackDelete(key) {
	  return this.__data__['delete'](key);
	}

	/**
	 * Gets the stack value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf Stack
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function stackGet(key) {
	  return this.__data__.get(key);
	}

	/**
	 * Checks if a stack value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf Stack
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function stackHas(key) {
	  return this.__data__.has(key);
	}

	/**
	 * Sets the stack `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf Stack
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the stack cache instance.
	 */
	function stackSet(key, value) {
	  var cache = this.__data__;
	  if (cache instanceof ListCache) {
	    var pairs = cache.__data__;
	    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
	      pairs.push([key, value]);
	      return this;
	    }
	    cache = this.__data__ = new MapCache(pairs);
	  }
	  cache.set(key, value);
	  return this;
	}

	// Add methods to `Stack`.
	Stack.prototype.clear = stackClear;
	Stack.prototype['delete'] = stackDelete;
	Stack.prototype.get = stackGet;
	Stack.prototype.has = stackHas;
	Stack.prototype.set = stackSet;

	/**
	 * Creates an array of the enumerable property names of the array-like `value`.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @param {boolean} inherited Specify returning inherited property names.
	 * @returns {Array} Returns the array of property names.
	 */
	function arrayLikeKeys(value, inherited) {
	  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
	  // Safari 9 makes `arguments.length` enumerable in strict mode.
	  var result = (isArray(value) || isArguments(value))
	    ? baseTimes(value.length, String)
	    : [];

	  var length = result.length,
	      skipIndexes = !!length;

	  for (var key in value) {
	    if ((inherited || hasOwnProperty.call(value, key)) &&
	        !(skipIndexes && (key == 'length' || isIndex(key, length)))) {
	      result.push(key);
	    }
	  }
	  return result;
	}

	/**
	 * Gets the index at which the `key` is found in `array` of key-value pairs.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {*} key The key to search for.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function assocIndexOf(array, key) {
	  var length = array.length;
	  while (length--) {
	    if (eq(array[length][0], key)) {
	      return length;
	    }
	  }
	  return -1;
	}

	/**
	 * The base implementation of methods like `_.difference` without support
	 * for excluding multiple arrays or iteratee shorthands.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {Array} values The values to exclude.
	 * @param {Function} [iteratee] The iteratee invoked per element.
	 * @param {Function} [comparator] The comparator invoked per element.
	 * @returns {Array} Returns the new array of filtered values.
	 */
	function baseDifference(array, values, iteratee, comparator) {
	  var index = -1,
	      includes = arrayIncludes,
	      isCommon = true,
	      length = array.length,
	      result = [],
	      valuesLength = values.length;

	  if (!length) {
	    return result;
	  }
	  if (iteratee) {
	    values = arrayMap(values, baseUnary(iteratee));
	  }
	  if (comparator) {
	    includes = arrayIncludesWith;
	    isCommon = false;
	  }
	  else if (values.length >= LARGE_ARRAY_SIZE) {
	    includes = cacheHas;
	    isCommon = false;
	    values = new SetCache(values);
	  }
	  outer:
	  while (++index < length) {
	    var value = array[index],
	        computed = iteratee ? iteratee(value) : value;

	    value = (comparator || value !== 0) ? value : 0;
	    if (isCommon && computed === computed) {
	      var valuesIndex = valuesLength;
	      while (valuesIndex--) {
	        if (values[valuesIndex] === computed) {
	          continue outer;
	        }
	      }
	      result.push(value);
	    }
	    else if (!includes(values, computed, comparator)) {
	      result.push(value);
	    }
	  }
	  return result;
	}

	/**
	 * The base implementation of `_.get` without support for default values.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path of the property to get.
	 * @returns {*} Returns the resolved value.
	 */
	function baseGet(object, path) {
	  path = isKey(path, object) ? [path] : castPath(path);

	  var index = 0,
	      length = path.length;

	  while (object != null && index < length) {
	    object = object[toKey(path[index++])];
	  }
	  return (index && index == length) ? object : undefined;
	}

	/**
	 * The base implementation of `getTag`.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the `toStringTag`.
	 */
	function baseGetTag(value) {
	  return objectToString.call(value);
	}

	/**
	 * The base implementation of `_.hasIn` without support for deep paths.
	 *
	 * @private
	 * @param {Object} [object] The object to query.
	 * @param {Array|string} key The key to check.
	 * @returns {boolean} Returns `true` if `key` exists, else `false`.
	 */
	function baseHasIn(object, key) {
	  return object != null && key in Object(object);
	}

	/**
	 * The base implementation of `_.isEqual` which supports partial comparisons
	 * and tracks traversed objects.
	 *
	 * @private
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @param {Function} [customizer] The function to customize comparisons.
	 * @param {boolean} [bitmask] The bitmask of comparison flags.
	 *  The bitmask may be composed of the following flags:
	 *     1 - Unordered comparison
	 *     2 - Partial comparison
	 * @param {Object} [stack] Tracks traversed `value` and `other` objects.
	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	 */
	function baseIsEqual(value, other, customizer, bitmask, stack) {
	  if (value === other) {
	    return true;
	  }
	  if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
	    return value !== value && other !== other;
	  }
	  return baseIsEqualDeep(value, other, baseIsEqual, customizer, bitmask, stack);
	}

	/**
	 * A specialized version of `baseIsEqual` for arrays and objects which performs
	 * deep comparisons and tracks traversed objects enabling objects with circular
	 * references to be compared.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Function} [customizer] The function to customize comparisons.
	 * @param {number} [bitmask] The bitmask of comparison flags. See `baseIsEqual`
	 *  for more details.
	 * @param {Object} [stack] Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function baseIsEqualDeep(object, other, equalFunc, customizer, bitmask, stack) {
	  var objIsArr = isArray(object),
	      othIsArr = isArray(other),
	      objTag = arrayTag,
	      othTag = arrayTag;

	  if (!objIsArr) {
	    objTag = getTag(object);
	    objTag = objTag == argsTag ? objectTag : objTag;
	  }
	  if (!othIsArr) {
	    othTag = getTag(other);
	    othTag = othTag == argsTag ? objectTag : othTag;
	  }
	  var objIsObj = objTag == objectTag && !isHostObject(object),
	      othIsObj = othTag == objectTag && !isHostObject(other),
	      isSameTag = objTag == othTag;

	  if (isSameTag && !objIsObj) {
	    stack || (stack = new Stack);
	    return (objIsArr || isTypedArray(object))
	      ? equalArrays(object, other, equalFunc, customizer, bitmask, stack)
	      : equalByTag(object, other, objTag, equalFunc, customizer, bitmask, stack);
	  }
	  if (!(bitmask & PARTIAL_COMPARE_FLAG)) {
	    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
	        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

	    if (objIsWrapped || othIsWrapped) {
	      var objUnwrapped = objIsWrapped ? object.value() : object,
	          othUnwrapped = othIsWrapped ? other.value() : other;

	      stack || (stack = new Stack);
	      return equalFunc(objUnwrapped, othUnwrapped, customizer, bitmask, stack);
	    }
	  }
	  if (!isSameTag) {
	    return false;
	  }
	  stack || (stack = new Stack);
	  return equalObjects(object, other, equalFunc, customizer, bitmask, stack);
	}

	/**
	 * The base implementation of `_.isMatch` without support for iteratee shorthands.
	 *
	 * @private
	 * @param {Object} object The object to inspect.
	 * @param {Object} source The object of property values to match.
	 * @param {Array} matchData The property names, values, and compare flags to match.
	 * @param {Function} [customizer] The function to customize comparisons.
	 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
	 */
	function baseIsMatch(object, source, matchData, customizer) {
	  var index = matchData.length,
	      length = index,
	      noCustomizer = !customizer;

	  if (object == null) {
	    return !length;
	  }
	  object = Object(object);
	  while (index--) {
	    var data = matchData[index];
	    if ((noCustomizer && data[2])
	          ? data[1] !== object[data[0]]
	          : !(data[0] in object)
	        ) {
	      return false;
	    }
	  }
	  while (++index < length) {
	    data = matchData[index];
	    var key = data[0],
	        objValue = object[key],
	        srcValue = data[1];

	    if (noCustomizer && data[2]) {
	      if (objValue === undefined && !(key in object)) {
	        return false;
	      }
	    } else {
	      var stack = new Stack;
	      if (customizer) {
	        var result = customizer(objValue, srcValue, key, object, source, stack);
	      }
	      if (!(result === undefined
	            ? baseIsEqual(srcValue, objValue, customizer, UNORDERED_COMPARE_FLAG | PARTIAL_COMPARE_FLAG, stack)
	            : result
	          )) {
	        return false;
	      }
	    }
	  }
	  return true;
	}

	/**
	 * The base implementation of `_.isNative` without bad shim checks.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a native function,
	 *  else `false`.
	 */
	function baseIsNative(value) {
	  if (!isObject(value) || isMasked(value)) {
	    return false;
	  }
	  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
	  return pattern.test(toSource(value));
	}

	/**
	 * The base implementation of `_.isTypedArray` without Node.js optimizations.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
	 */
	function baseIsTypedArray(value) {
	  return isObjectLike(value) &&
	    isLength(value.length) && !!typedArrayTags[objectToString.call(value)];
	}

	/**
	 * The base implementation of `_.iteratee`.
	 *
	 * @private
	 * @param {*} [value=_.identity] The value to convert to an iteratee.
	 * @returns {Function} Returns the iteratee.
	 */
	function baseIteratee(value) {
	  // Don't store the `typeof` result in a variable to avoid a JIT bug in Safari 9.
	  // See https://bugs.webkit.org/show_bug.cgi?id=156034 for more details.
	  if (typeof value == 'function') {
	    return value;
	  }
	  if (value == null) {
	    return identity;
	  }
	  if (typeof value == 'object') {
	    return isArray(value)
	      ? baseMatchesProperty(value[0], value[1])
	      : baseMatches(value);
	  }
	  return property(value);
	}

	/**
	 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the array of property names.
	 */
	function baseKeys(object) {
	  if (!isPrototype(object)) {
	    return nativeKeys(object);
	  }
	  var result = [];
	  for (var key in Object(object)) {
	    if (hasOwnProperty.call(object, key) && key != 'constructor') {
	      result.push(key);
	    }
	  }
	  return result;
	}

	/**
	 * The base implementation of `_.matches` which doesn't clone `source`.
	 *
	 * @private
	 * @param {Object} source The object of property values to match.
	 * @returns {Function} Returns the new spec function.
	 */
	function baseMatches(source) {
	  var matchData = getMatchData(source);
	  if (matchData.length == 1 && matchData[0][2]) {
	    return matchesStrictComparable(matchData[0][0], matchData[0][1]);
	  }
	  return function(object) {
	    return object === source || baseIsMatch(object, source, matchData);
	  };
	}

	/**
	 * The base implementation of `_.matchesProperty` which doesn't clone `srcValue`.
	 *
	 * @private
	 * @param {string} path The path of the property to get.
	 * @param {*} srcValue The value to match.
	 * @returns {Function} Returns the new spec function.
	 */
	function baseMatchesProperty(path, srcValue) {
	  if (isKey(path) && isStrictComparable(srcValue)) {
	    return matchesStrictComparable(toKey(path), srcValue);
	  }
	  return function(object) {
	    var objValue = get(object, path);
	    return (objValue === undefined && objValue === srcValue)
	      ? hasIn(object, path)
	      : baseIsEqual(srcValue, objValue, undefined, UNORDERED_COMPARE_FLAG | PARTIAL_COMPARE_FLAG);
	  };
	}

	/**
	 * A specialized version of `baseProperty` which supports deep paths.
	 *
	 * @private
	 * @param {Array|string} path The path of the property to get.
	 * @returns {Function} Returns the new accessor function.
	 */
	function basePropertyDeep(path) {
	  return function(object) {
	    return baseGet(object, path);
	  };
	}

	/**
	 * The base implementation of `_.rest` which doesn't validate or coerce arguments.
	 *
	 * @private
	 * @param {Function} func The function to apply a rest parameter to.
	 * @param {number} [start=func.length-1] The start position of the rest parameter.
	 * @returns {Function} Returns the new function.
	 */
	function baseRest(func, start) {
	  start = nativeMax(start === undefined ? (func.length - 1) : start, 0);
	  return function() {
	    var args = arguments,
	        index = -1,
	        length = nativeMax(args.length - start, 0),
	        array = Array(length);

	    while (++index < length) {
	      array[index] = args[start + index];
	    }
	    index = -1;
	    var otherArgs = Array(start + 1);
	    while (++index < start) {
	      otherArgs[index] = args[index];
	    }
	    otherArgs[start] = array;
	    return apply(func, this, otherArgs);
	  };
	}

	/**
	 * The base implementation of `_.toString` which doesn't convert nullish
	 * values to empty strings.
	 *
	 * @private
	 * @param {*} value The value to process.
	 * @returns {string} Returns the string.
	 */
	function baseToString(value) {
	  // Exit early for strings to avoid a performance hit in some environments.
	  if (typeof value == 'string') {
	    return value;
	  }
	  if (isSymbol(value)) {
	    return symbolToString ? symbolToString.call(value) : '';
	  }
	  var result = (value + '');
	  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
	}

	/**
	 * The base implementation of `_.uniqBy` without support for iteratee shorthands.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {Function} [iteratee] The iteratee invoked per element.
	 * @param {Function} [comparator] The comparator invoked per element.
	 * @returns {Array} Returns the new duplicate free array.
	 */
	function baseUniq(array, iteratee, comparator) {
	  var index = -1,
	      includes = arrayIncludes,
	      length = array.length,
	      isCommon = true,
	      result = [],
	      seen = result;

	  if (comparator) {
	    isCommon = false;
	    includes = arrayIncludesWith;
	  }
	  else if (length >= LARGE_ARRAY_SIZE) {
	    var set = iteratee ? null : createSet(array);
	    if (set) {
	      return setToArray(set);
	    }
	    isCommon = false;
	    includes = cacheHas;
	    seen = new SetCache;
	  }
	  else {
	    seen = iteratee ? [] : result;
	  }
	  outer:
	  while (++index < length) {
	    var value = array[index],
	        computed = iteratee ? iteratee(value) : value;

	    value = (comparator || value !== 0) ? value : 0;
	    if (isCommon && computed === computed) {
	      var seenIndex = seen.length;
	      while (seenIndex--) {
	        if (seen[seenIndex] === computed) {
	          continue outer;
	        }
	      }
	      if (iteratee) {
	        seen.push(computed);
	      }
	      result.push(value);
	    }
	    else if (!includes(seen, computed, comparator)) {
	      if (seen !== result) {
	        seen.push(computed);
	      }
	      result.push(value);
	    }
	  }
	  return result;
	}

	/**
	 * The base implementation of methods like `_.xor`, without support for
	 * iteratee shorthands, that accepts an array of arrays to inspect.
	 *
	 * @private
	 * @param {Array} arrays The arrays to inspect.
	 * @param {Function} [iteratee] The iteratee invoked per element.
	 * @param {Function} [comparator] The comparator invoked per element.
	 * @returns {Array} Returns the new array of values.
	 */
	function baseXor(arrays, iteratee, comparator) {
	  var index = -1,
	      length = arrays.length;

	  while (++index < length) {
	    var result = result
	      ? arrayPush(
	          baseDifference(result, arrays[index], iteratee, comparator),
	          baseDifference(arrays[index], result, iteratee, comparator)
	        )
	      : arrays[index];
	  }
	  return (result && result.length) ? baseUniq(result, iteratee, comparator) : [];
	}

	/**
	 * Casts `value` to a path array if it's not one.
	 *
	 * @private
	 * @param {*} value The value to inspect.
	 * @returns {Array} Returns the cast property path array.
	 */
	function castPath(value) {
	  return isArray(value) ? value : stringToPath(value);
	}

	/**
	 * Creates a set object of `values`.
	 *
	 * @private
	 * @param {Array} values The values to add to the set.
	 * @returns {Object} Returns the new set.
	 */
	var createSet = !(Set && (1 / setToArray(new Set([,-0]))[1]) == INFINITY) ? noop : function(values) {
	  return new Set(values);
	};

	/**
	 * A specialized version of `baseIsEqualDeep` for arrays with support for
	 * partial deep comparisons.
	 *
	 * @private
	 * @param {Array} array The array to compare.
	 * @param {Array} other The other array to compare.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
	 *  for more details.
	 * @param {Object} stack Tracks traversed `array` and `other` objects.
	 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
	 */
	function equalArrays(array, other, equalFunc, customizer, bitmask, stack) {
	  var isPartial = bitmask & PARTIAL_COMPARE_FLAG,
	      arrLength = array.length,
	      othLength = other.length;

	  if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
	    return false;
	  }
	  // Assume cyclic values are equal.
	  var stacked = stack.get(array);
	  if (stacked && stack.get(other)) {
	    return stacked == other;
	  }
	  var index = -1,
	      result = true,
	      seen = (bitmask & UNORDERED_COMPARE_FLAG) ? new SetCache : undefined;

	  stack.set(array, other);
	  stack.set(other, array);

	  // Ignore non-index properties.
	  while (++index < arrLength) {
	    var arrValue = array[index],
	        othValue = other[index];

	    if (customizer) {
	      var compared = isPartial
	        ? customizer(othValue, arrValue, index, other, array, stack)
	        : customizer(arrValue, othValue, index, array, other, stack);
	    }
	    if (compared !== undefined) {
	      if (compared) {
	        continue;
	      }
	      result = false;
	      break;
	    }
	    // Recursively compare arrays (susceptible to call stack limits).
	    if (seen) {
	      if (!arraySome(other, function(othValue, othIndex) {
	            if (!seen.has(othIndex) &&
	                (arrValue === othValue || equalFunc(arrValue, othValue, customizer, bitmask, stack))) {
	              return seen.add(othIndex);
	            }
	          })) {
	        result = false;
	        break;
	      }
	    } else if (!(
	          arrValue === othValue ||
	            equalFunc(arrValue, othValue, customizer, bitmask, stack)
	        )) {
	      result = false;
	      break;
	    }
	  }
	  stack['delete'](array);
	  stack['delete'](other);
	  return result;
	}

	/**
	 * A specialized version of `baseIsEqualDeep` for comparing objects of
	 * the same `toStringTag`.
	 *
	 * **Note:** This function only supports comparing values with tags of
	 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {string} tag The `toStringTag` of the objects to compare.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
	 *  for more details.
	 * @param {Object} stack Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function equalByTag(object, other, tag, equalFunc, customizer, bitmask, stack) {
	  switch (tag) {
	    case dataViewTag:
	      if ((object.byteLength != other.byteLength) ||
	          (object.byteOffset != other.byteOffset)) {
	        return false;
	      }
	      object = object.buffer;
	      other = other.buffer;

	    case arrayBufferTag:
	      if ((object.byteLength != other.byteLength) ||
	          !equalFunc(new Uint8Array(object), new Uint8Array(other))) {
	        return false;
	      }
	      return true;

	    case boolTag:
	    case dateTag:
	    case numberTag:
	      // Coerce booleans to `1` or `0` and dates to milliseconds.
	      // Invalid dates are coerced to `NaN`.
	      return eq(+object, +other);

	    case errorTag:
	      return object.name == other.name && object.message == other.message;

	    case regexpTag:
	    case stringTag:
	      // Coerce regexes to strings and treat strings, primitives and objects,
	      // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
	      // for more details.
	      return object == (other + '');

	    case mapTag:
	      var convert = mapToArray;

	    case setTag:
	      var isPartial = bitmask & PARTIAL_COMPARE_FLAG;
	      convert || (convert = setToArray);

	      if (object.size != other.size && !isPartial) {
	        return false;
	      }
	      // Assume cyclic values are equal.
	      var stacked = stack.get(object);
	      if (stacked) {
	        return stacked == other;
	      }
	      bitmask |= UNORDERED_COMPARE_FLAG;

	      // Recursively compare objects (susceptible to call stack limits).
	      stack.set(object, other);
	      var result = equalArrays(convert(object), convert(other), equalFunc, customizer, bitmask, stack);
	      stack['delete'](object);
	      return result;

	    case symbolTag:
	      if (symbolValueOf) {
	        return symbolValueOf.call(object) == symbolValueOf.call(other);
	      }
	  }
	  return false;
	}

	/**
	 * A specialized version of `baseIsEqualDeep` for objects with support for
	 * partial deep comparisons.
	 *
	 * @private
	 * @param {Object} object The object to compare.
	 * @param {Object} other The other object to compare.
	 * @param {Function} equalFunc The function to determine equivalents of values.
	 * @param {Function} customizer The function to customize comparisons.
	 * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
	 *  for more details.
	 * @param {Object} stack Tracks traversed `object` and `other` objects.
	 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
	 */
	function equalObjects(object, other, equalFunc, customizer, bitmask, stack) {
	  var isPartial = bitmask & PARTIAL_COMPARE_FLAG,
	      objProps = keys(object),
	      objLength = objProps.length,
	      othProps = keys(other),
	      othLength = othProps.length;

	  if (objLength != othLength && !isPartial) {
	    return false;
	  }
	  var index = objLength;
	  while (index--) {
	    var key = objProps[index];
	    if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
	      return false;
	    }
	  }
	  // Assume cyclic values are equal.
	  var stacked = stack.get(object);
	  if (stacked && stack.get(other)) {
	    return stacked == other;
	  }
	  var result = true;
	  stack.set(object, other);
	  stack.set(other, object);

	  var skipCtor = isPartial;
	  while (++index < objLength) {
	    key = objProps[index];
	    var objValue = object[key],
	        othValue = other[key];

	    if (customizer) {
	      var compared = isPartial
	        ? customizer(othValue, objValue, key, other, object, stack)
	        : customizer(objValue, othValue, key, object, other, stack);
	    }
	    // Recursively compare objects (susceptible to call stack limits).
	    if (!(compared === undefined
	          ? (objValue === othValue || equalFunc(objValue, othValue, customizer, bitmask, stack))
	          : compared
	        )) {
	      result = false;
	      break;
	    }
	    skipCtor || (skipCtor = key == 'constructor');
	  }
	  if (result && !skipCtor) {
	    var objCtor = object.constructor,
	        othCtor = other.constructor;

	    // Non `Object` object instances with different constructors are not equal.
	    if (objCtor != othCtor &&
	        ('constructor' in object && 'constructor' in other) &&
	        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
	          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
	      result = false;
	    }
	  }
	  stack['delete'](object);
	  stack['delete'](other);
	  return result;
	}

	/**
	 * Gets the data for `map`.
	 *
	 * @private
	 * @param {Object} map The map to query.
	 * @param {string} key The reference key.
	 * @returns {*} Returns the map data.
	 */
	function getMapData(map, key) {
	  var data = map.__data__;
	  return isKeyable(key)
	    ? data[typeof key == 'string' ? 'string' : 'hash']
	    : data.map;
	}

	/**
	 * Gets the property names, values, and compare flags of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the match data of `object`.
	 */
	function getMatchData(object) {
	  var result = keys(object),
	      length = result.length;

	  while (length--) {
	    var key = result[length],
	        value = object[key];

	    result[length] = [key, value, isStrictComparable(value)];
	  }
	  return result;
	}

	/**
	 * Gets the native function at `key` of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {string} key The key of the method to get.
	 * @returns {*} Returns the function if it's native, else `undefined`.
	 */
	function getNative(object, key) {
	  var value = getValue(object, key);
	  return baseIsNative(value) ? value : undefined;
	}

	/**
	 * Gets the `toStringTag` of `value`.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the `toStringTag`.
	 */
	var getTag = baseGetTag;

	// Fallback for data views, maps, sets, and weak maps in IE 11,
	// for data views in Edge < 14, and promises in Node.js.
	if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
	    (Map && getTag(new Map) != mapTag) ||
	    (Promise && getTag(Promise.resolve()) != promiseTag) ||
	    (Set && getTag(new Set) != setTag) ||
	    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
	  getTag = function(value) {
	    var result = objectToString.call(value),
	        Ctor = result == objectTag ? value.constructor : undefined,
	        ctorString = Ctor ? toSource(Ctor) : undefined;

	    if (ctorString) {
	      switch (ctorString) {
	        case dataViewCtorString: return dataViewTag;
	        case mapCtorString: return mapTag;
	        case promiseCtorString: return promiseTag;
	        case setCtorString: return setTag;
	        case weakMapCtorString: return weakMapTag;
	      }
	    }
	    return result;
	  };
	}

	/**
	 * Checks if `path` exists on `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path to check.
	 * @param {Function} hasFunc The function to check properties.
	 * @returns {boolean} Returns `true` if `path` exists, else `false`.
	 */
	function hasPath(object, path, hasFunc) {
	  path = isKey(path, object) ? [path] : castPath(path);

	  var result,
	      index = -1,
	      length = path.length;

	  while (++index < length) {
	    var key = toKey(path[index]);
	    if (!(result = object != null && hasFunc(object, key))) {
	      break;
	    }
	    object = object[key];
	  }
	  if (result) {
	    return result;
	  }
	  var length = object ? object.length : 0;
	  return !!length && isLength(length) && isIndex(key, length) &&
	    (isArray(object) || isArguments(object));
	}

	/**
	 * Checks if `value` is a valid array-like index.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
	 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
	 */
	function isIndex(value, length) {
	  length = length == null ? MAX_SAFE_INTEGER : length;
	  return !!length &&
	    (typeof value == 'number' || reIsUint.test(value)) &&
	    (value > -1 && value % 1 == 0 && value < length);
	}

	/**
	 * Checks if `value` is a property name and not a property path.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @param {Object} [object] The object to query keys on.
	 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
	 */
	function isKey(value, object) {
	  if (isArray(value)) {
	    return false;
	  }
	  var type = typeof value;
	  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
	      value == null || isSymbol(value)) {
	    return true;
	  }
	  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
	    (object != null && value in Object(object));
	}

	/**
	 * Checks if `value` is suitable for use as unique object key.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
	 */
	function isKeyable(value) {
	  var type = typeof value;
	  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
	    ? (value !== '__proto__')
	    : (value === null);
	}

	/**
	 * Checks if `func` has its source masked.
	 *
	 * @private
	 * @param {Function} func The function to check.
	 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
	 */
	function isMasked(func) {
	  return !!maskSrcKey && (maskSrcKey in func);
	}

	/**
	 * Checks if `value` is likely a prototype object.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
	 */
	function isPrototype(value) {
	  var Ctor = value && value.constructor,
	      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

	  return value === proto;
	}

	/**
	 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` if suitable for strict
	 *  equality comparisons, else `false`.
	 */
	function isStrictComparable(value) {
	  return value === value && !isObject(value);
	}

	/**
	 * A specialized version of `matchesProperty` for source values suitable
	 * for strict equality comparisons, i.e. `===`.
	 *
	 * @private
	 * @param {string} key The key of the property to get.
	 * @param {*} srcValue The value to match.
	 * @returns {Function} Returns the new spec function.
	 */
	function matchesStrictComparable(key, srcValue) {
	  return function(object) {
	    if (object == null) {
	      return false;
	    }
	    return object[key] === srcValue &&
	      (srcValue !== undefined || (key in Object(object)));
	  };
	}

	/**
	 * Converts `string` to a property path array.
	 *
	 * @private
	 * @param {string} string The string to convert.
	 * @returns {Array} Returns the property path array.
	 */
	var stringToPath = memoize(function(string) {
	  string = toString(string);

	  var result = [];
	  if (reLeadingDot.test(string)) {
	    result.push('');
	  }
	  string.replace(rePropName, function(match, number, quote, string) {
	    result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
	  });
	  return result;
	});

	/**
	 * Converts `value` to a string key if it's not a string or symbol.
	 *
	 * @private
	 * @param {*} value The value to inspect.
	 * @returns {string|symbol} Returns the key.
	 */
	function toKey(value) {
	  if (typeof value == 'string' || isSymbol(value)) {
	    return value;
	  }
	  var result = (value + '');
	  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
	}

	/**
	 * Converts `func` to its source code.
	 *
	 * @private
	 * @param {Function} func The function to process.
	 * @returns {string} Returns the source code.
	 */
	function toSource(func) {
	  if (func != null) {
	    try {
	      return funcToString.call(func);
	    } catch (e) {}
	    try {
	      return (func + '');
	    } catch (e) {}
	  }
	  return '';
	}

	/**
	 * Gets the last element of `array`.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Array
	 * @param {Array} array The array to query.
	 * @returns {*} Returns the last element of `array`.
	 * @example
	 *
	 * _.last([1, 2, 3]);
	 * // => 3
	 */
	function last(array) {
	  var length = array ? array.length : 0;
	  return length ? array[length - 1] : undefined;
	}

	/**
	 * This method is like `_.xor` except that it accepts `iteratee` which is
	 * invoked for each element of each `arrays` to generate the criterion by
	 * which by which they're compared. The iteratee is invoked with one argument:
	 * (value).
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Array
	 * @param {...Array} [arrays] The arrays to inspect.
	 * @param {Function} [iteratee=_.identity]
	 *  The iteratee invoked per element.
	 * @returns {Array} Returns the new array of filtered values.
	 * @example
	 *
	 * _.xorBy([2.1, 1.2], [2.3, 3.4], Math.floor);
	 * // => [1.2, 3.4]
	 *
	 * // The `_.property` iteratee shorthand.
	 * _.xorBy([{ 'x': 1 }], [{ 'x': 2 }, { 'x': 1 }], 'x');
	 * // => [{ 'x': 2 }]
	 */
	var xorBy = baseRest(function(arrays) {
	  var iteratee = last(arrays);
	  if (isArrayLikeObject(iteratee)) {
	    iteratee = undefined;
	  }
	  return baseXor(arrayFilter(arrays, isArrayLikeObject), baseIteratee(iteratee));
	});

	/**
	 * Creates a function that memoizes the result of `func`. If `resolver` is
	 * provided, it determines the cache key for storing the result based on the
	 * arguments provided to the memoized function. By default, the first argument
	 * provided to the memoized function is used as the map cache key. The `func`
	 * is invoked with the `this` binding of the memoized function.
	 *
	 * **Note:** The cache is exposed as the `cache` property on the memoized
	 * function. Its creation may be customized by replacing the `_.memoize.Cache`
	 * constructor with one whose instances implement the
	 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
	 * method interface of `delete`, `get`, `has`, and `set`.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Function
	 * @param {Function} func The function to have its output memoized.
	 * @param {Function} [resolver] The function to resolve the cache key.
	 * @returns {Function} Returns the new memoized function.
	 * @example
	 *
	 * var object = { 'a': 1, 'b': 2 };
	 * var other = { 'c': 3, 'd': 4 };
	 *
	 * var values = _.memoize(_.values);
	 * values(object);
	 * // => [1, 2]
	 *
	 * values(other);
	 * // => [3, 4]
	 *
	 * object.a = 2;
	 * values(object);
	 * // => [1, 2]
	 *
	 * // Modify the result cache.
	 * values.cache.set(object, ['a', 'b']);
	 * values(object);
	 * // => ['a', 'b']
	 *
	 * // Replace `_.memoize.Cache`.
	 * _.memoize.Cache = WeakMap;
	 */
	function memoize(func, resolver) {
	  if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
	    throw new TypeError(FUNC_ERROR_TEXT);
	  }
	  var memoized = function() {
	    var args = arguments,
	        key = resolver ? resolver.apply(this, args) : args[0],
	        cache = memoized.cache;

	    if (cache.has(key)) {
	      return cache.get(key);
	    }
	    var result = func.apply(this, args);
	    memoized.cache = cache.set(key, result);
	    return result;
	  };
	  memoized.cache = new (memoize.Cache || MapCache);
	  return memoized;
	}

	// Assign cache to `_.memoize`.
	memoize.Cache = MapCache;

	/**
	 * Performs a
	 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
	 * comparison between two values to determine if they are equivalent.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	 * @example
	 *
	 * var object = { 'a': 1 };
	 * var other = { 'a': 1 };
	 *
	 * _.eq(object, object);
	 * // => true
	 *
	 * _.eq(object, other);
	 * // => false
	 *
	 * _.eq('a', 'a');
	 * // => true
	 *
	 * _.eq('a', Object('a'));
	 * // => false
	 *
	 * _.eq(NaN, NaN);
	 * // => true
	 */
	function eq(value, other) {
	  return value === other || (value !== value && other !== other);
	}

	/**
	 * Checks if `value` is likely an `arguments` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
	 *  else `false`.
	 * @example
	 *
	 * _.isArguments(function() { return arguments; }());
	 * // => true
	 *
	 * _.isArguments([1, 2, 3]);
	 * // => false
	 */
	function isArguments(value) {
	  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
	  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
	    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
	}

	/**
	 * Checks if `value` is classified as an `Array` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
	 * @example
	 *
	 * _.isArray([1, 2, 3]);
	 * // => true
	 *
	 * _.isArray(document.body.children);
	 * // => false
	 *
	 * _.isArray('abc');
	 * // => false
	 *
	 * _.isArray(_.noop);
	 * // => false
	 */
	var isArray = Array.isArray;

	/**
	 * Checks if `value` is array-like. A value is considered array-like if it's
	 * not a function and has a `value.length` that's an integer greater than or
	 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
	 * @example
	 *
	 * _.isArrayLike([1, 2, 3]);
	 * // => true
	 *
	 * _.isArrayLike(document.body.children);
	 * // => true
	 *
	 * _.isArrayLike('abc');
	 * // => true
	 *
	 * _.isArrayLike(_.noop);
	 * // => false
	 */
	function isArrayLike(value) {
	  return value != null && isLength(value.length) && !isFunction(value);
	}

	/**
	 * This method is like `_.isArrayLike` except that it also checks if `value`
	 * is an object.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an array-like object,
	 *  else `false`.
	 * @example
	 *
	 * _.isArrayLikeObject([1, 2, 3]);
	 * // => true
	 *
	 * _.isArrayLikeObject(document.body.children);
	 * // => true
	 *
	 * _.isArrayLikeObject('abc');
	 * // => false
	 *
	 * _.isArrayLikeObject(_.noop);
	 * // => false
	 */
	function isArrayLikeObject(value) {
	  return isObjectLike(value) && isArrayLike(value);
	}

	/**
	 * Checks if `value` is classified as a `Function` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
	 * @example
	 *
	 * _.isFunction(_);
	 * // => true
	 *
	 * _.isFunction(/abc/);
	 * // => false
	 */
	function isFunction(value) {
	  // The use of `Object#toString` avoids issues with the `typeof` operator
	  // in Safari 8-9 which returns 'object' for typed array and other constructors.
	  var tag = isObject(value) ? objectToString.call(value) : '';
	  return tag == funcTag || tag == genTag;
	}

	/**
	 * Checks if `value` is a valid array-like length.
	 *
	 * **Note:** This method is loosely based on
	 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
	 * @example
	 *
	 * _.isLength(3);
	 * // => true
	 *
	 * _.isLength(Number.MIN_VALUE);
	 * // => false
	 *
	 * _.isLength(Infinity);
	 * // => false
	 *
	 * _.isLength('3');
	 * // => false
	 */
	function isLength(value) {
	  return typeof value == 'number' &&
	    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
	}

	/**
	 * Checks if `value` is the
	 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
	 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
	 * @example
	 *
	 * _.isObject({});
	 * // => true
	 *
	 * _.isObject([1, 2, 3]);
	 * // => true
	 *
	 * _.isObject(_.noop);
	 * // => true
	 *
	 * _.isObject(null);
	 * // => false
	 */
	function isObject(value) {
	  var type = typeof value;
	  return !!value && (type == 'object' || type == 'function');
	}

	/**
	 * Checks if `value` is object-like. A value is object-like if it's not `null`
	 * and has a `typeof` result of "object".
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
	 * @example
	 *
	 * _.isObjectLike({});
	 * // => true
	 *
	 * _.isObjectLike([1, 2, 3]);
	 * // => true
	 *
	 * _.isObjectLike(_.noop);
	 * // => false
	 *
	 * _.isObjectLike(null);
	 * // => false
	 */
	function isObjectLike(value) {
	  return !!value && typeof value == 'object';
	}

	/**
	 * Checks if `value` is classified as a `Symbol` primitive or object.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
	 * @example
	 *
	 * _.isSymbol(Symbol.iterator);
	 * // => true
	 *
	 * _.isSymbol('abc');
	 * // => false
	 */
	function isSymbol(value) {
	  return typeof value == 'symbol' ||
	    (isObjectLike(value) && objectToString.call(value) == symbolTag);
	}

	/**
	 * Checks if `value` is classified as a typed array.
	 *
	 * @static
	 * @memberOf _
	 * @since 3.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
	 * @example
	 *
	 * _.isTypedArray(new Uint8Array);
	 * // => true
	 *
	 * _.isTypedArray([]);
	 * // => false
	 */
	var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

	/**
	 * Converts `value` to a string. An empty string is returned for `null`
	 * and `undefined` values. The sign of `-0` is preserved.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to process.
	 * @returns {string} Returns the string.
	 * @example
	 *
	 * _.toString(null);
	 * // => ''
	 *
	 * _.toString(-0);
	 * // => '-0'
	 *
	 * _.toString([1, 2, 3]);
	 * // => '1,2,3'
	 */
	function toString(value) {
	  return value == null ? '' : baseToString(value);
	}

	/**
	 * Gets the value at `path` of `object`. If the resolved value is
	 * `undefined`, the `defaultValue` is returned in its place.
	 *
	 * @static
	 * @memberOf _
	 * @since 3.7.0
	 * @category Object
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path of the property to get.
	 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
	 * @returns {*} Returns the resolved value.
	 * @example
	 *
	 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
	 *
	 * _.get(object, 'a[0].b.c');
	 * // => 3
	 *
	 * _.get(object, ['a', '0', 'b', 'c']);
	 * // => 3
	 *
	 * _.get(object, 'a.b.c', 'default');
	 * // => 'default'
	 */
	function get(object, path, defaultValue) {
	  var result = object == null ? undefined : baseGet(object, path);
	  return result === undefined ? defaultValue : result;
	}

	/**
	 * Checks if `path` is a direct or inherited property of `object`.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Object
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path to check.
	 * @returns {boolean} Returns `true` if `path` exists, else `false`.
	 * @example
	 *
	 * var object = _.create({ 'a': _.create({ 'b': 2 }) });
	 *
	 * _.hasIn(object, 'a');
	 * // => true
	 *
	 * _.hasIn(object, 'a.b');
	 * // => true
	 *
	 * _.hasIn(object, ['a', 'b']);
	 * // => true
	 *
	 * _.hasIn(object, 'b');
	 * // => false
	 */
	function hasIn(object, path) {
	  return object != null && hasPath(object, path, baseHasIn);
	}

	/**
	 * Creates an array of the own enumerable property names of `object`.
	 *
	 * **Note:** Non-object values are coerced to objects. See the
	 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
	 * for more details.
	 *
	 * @static
	 * @since 0.1.0
	 * @memberOf _
	 * @category Object
	 * @param {Object} object The object to query.
	 * @returns {Array} Returns the array of property names.
	 * @example
	 *
	 * function Foo() {
	 *   this.a = 1;
	 *   this.b = 2;
	 * }
	 *
	 * Foo.prototype.c = 3;
	 *
	 * _.keys(new Foo);
	 * // => ['a', 'b'] (iteration order is not guaranteed)
	 *
	 * _.keys('hi');
	 * // => ['0', '1']
	 */
	function keys(object) {
	  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
	}

	/**
	 * This method returns the first argument it receives.
	 *
	 * @static
	 * @since 0.1.0
	 * @memberOf _
	 * @category Util
	 * @param {*} value Any value.
	 * @returns {*} Returns `value`.
	 * @example
	 *
	 * var object = { 'a': 1 };
	 *
	 * console.log(_.identity(object) === object);
	 * // => true
	 */
	function identity(value) {
	  return value;
	}

	/**
	 * This method returns `undefined`.
	 *
	 * @static
	 * @memberOf _
	 * @since 2.3.0
	 * @category Util
	 * @example
	 *
	 * _.times(2, _.noop);
	 * // => [undefined, undefined]
	 */
	function noop() {
	  // No operation performed.
	}

	/**
	 * Creates a function that returns the value at `path` of a given object.
	 *
	 * @static
	 * @memberOf _
	 * @since 2.4.0
	 * @category Util
	 * @param {Array|string} path The path of the property to get.
	 * @returns {Function} Returns the new accessor function.
	 * @example
	 *
	 * var objects = [
	 *   { 'a': { 'b': 2 } },
	 *   { 'a': { 'b': 1 } }
	 * ];
	 *
	 * _.map(objects, _.property('a.b'));
	 * // => [2, 1]
	 *
	 * _.map(_.sortBy(objects, _.property(['a', 'b'])), 'a.b');
	 * // => [1, 2]
	 */
	function property(path) {
	  return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
	}

	module.exports = xorBy;
	});

	var matchingUnions = createCommonjsModule(function (module, exports) {
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.UniqueUnionTypes = void 0;

	const lodash_xorby_1 = __importDefault(lodash_xorby);


	function UniqueUnionTypes(context) {
	    const knownTypes = Object.create(null);
	    const schema = context.getSchema();
	    return {
	        UnionTypeDefinition: validateUnionTypes,
	    };
	    function validateUnionTypes(node) {
	        const typeName = node.name.value;
	        const typeFromSchema = schema && schema.getType(typeName);
	        const typeNodeFromSchema = typeFromSchema &&
	            typeFromSchema.astNode;
	        const typeNodeFromDefs = knownTypes[typeName];
	        const duplicateTypeNode = typeNodeFromSchema || typeNodeFromDefs;
	        if (duplicateTypeNode) {
	            const unionDiff = lodash_xorby_1.default(node.types, duplicateTypeNode.types, 'name.value');
	            const diffLength = unionDiff.length;
	            if (diffLength > 0) {
	                context.reportError(utils$1.errorWithCode('VALUE_TYPE_UNION_TYPES_MISMATCH', `${utils$1.logServiceAndType(duplicateTypeNode.serviceName, typeName)}The union \`${typeName}\` is defined in services \`${duplicateTypeNode.serviceName}\` and \`${node.serviceName}\`, however their types do not match. Union types with the same name must also consist of identical types. The type${diffLength > 1 ? 's' : ''} ${unionDiff.map(diffEntry => diffEntry.name.value).join(', ')} ${diffLength > 1 ? 'are' : 'is'} mismatched.`, [node, duplicateTypeNode]));
	            }
	            return false;
	        }
	        if (typeFromSchema) {
	            context.reportError(new graphql_1.GraphQLError(uniqueTypeNamesWithFields.existedTypeNameMessage(typeName), node.name));
	            return;
	        }
	        if (knownTypes[typeName]) {
	            context.reportError(new graphql_1.GraphQLError(uniqueTypeNamesWithFields.duplicateTypeNameMessage(typeName), [
	                knownTypes[typeName],
	                node.name,
	            ]));
	        }
	        else {
	            knownTypes[typeName] = node;
	        }
	        return false;
	    }
	}
	exports.UniqueUnionTypes = UniqueUnionTypes;

	});

	var sdl = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });

	Object.defineProperty(exports, "UniqueTypeNamesWithFields", { enumerable: true, get: function () { return uniqueTypeNamesWithFields.UniqueTypeNamesWithFields; } });

	Object.defineProperty(exports, "MatchingEnums", { enumerable: true, get: function () { return matchingEnums.MatchingEnums; } });

	Object.defineProperty(exports, "PossibleTypeExtensions", { enumerable: true, get: function () { return possibleTypeExtensions.PossibleTypeExtensions; } });

	Object.defineProperty(exports, "UniqueFieldDefinitionNames", { enumerable: true, get: function () { return uniqueFieldDefinitionNames.UniqueFieldDefinitionNames; } });

	Object.defineProperty(exports, "UniqueUnionTypes", { enumerable: true, get: function () { return matchingUnions.UniqueUnionTypes; } });

	});

	var UniqueTypeNames_1 = /*@__PURE__*/getAugmentedNamespace(UniqueTypeNames$1);

	var UniqueEnumValueNames_1 = /*@__PURE__*/getAugmentedNamespace(UniqueEnumValueNames$1);

	var UniqueFieldDefinitionNames_1 = /*@__PURE__*/getAugmentedNamespace(UniqueFieldDefinitionNames$1);

	var rules = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.compositionRules = void 0;







	const omit = [
	    graphql_1.UniqueDirectivesPerLocationRule,
	    UniqueTypeNames_1.UniqueTypeNames,
	    UniqueEnumValueNames_1.UniqueEnumValueNames,
	    PossibleTypeExtensions_1.PossibleTypeExtensions,
	    UniqueFieldDefinitionNames_1.UniqueFieldDefinitionNames,
	];
	exports.compositionRules = specifiedRules_1.specifiedSDLRules
	    .filter(rule => !omit.includes(rule))
	    .concat([
	    sdl.UniqueFieldDefinitionNames,
	    sdl.UniqueTypeNamesWithFields,
	    sdl.MatchingEnums,
	    sdl.UniqueUnionTypes,
	    sdl.PossibleTypeExtensions,
	]);

	});

	var compose = createCommonjsModule(function (module, exports) {
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.composeServices = exports.addFederationMetadataToSchemaNodes = exports.buildSchemaFromDefinitionsAndExtensions = exports.buildMapsFromServiceList = void 0;


	const directives_1 = __importDefault(directives);



	const EmptyQueryDefinition = {
	    kind: graphql_1.Kind.OBJECT_TYPE_DEFINITION,
	    name: { kind: graphql_1.Kind.NAME, value: utils$1.defaultRootOperationNameLookup.query },
	    fields: [],
	    serviceName: null,
	};
	const EmptyMutationDefinition = {
	    kind: graphql_1.Kind.OBJECT_TYPE_DEFINITION,
	    name: { kind: graphql_1.Kind.NAME, value: utils$1.defaultRootOperationNameLookup.mutation },
	    fields: [],
	    serviceName: null,
	};
	function buildMapsFromServiceList(serviceList) {
	    const typeDefinitionsMap = Object.create(null);
	    const typeExtensionsMap = Object.create(null);
	    const directiveDefinitionsMap = Object.create(null);
	    const typeToServiceMap = Object.create(null);
	    const externalFields = [];
	    const keyDirectivesMap = Object.create(null);
	    const valueTypes = new Set();
	    for (const { typeDefs, name: serviceName } of serviceList) {
	        const { typeDefsWithoutExternalFields, strippedFields, } = utils$1.stripExternalFieldsFromTypeDefs(typeDefs, serviceName);
	        externalFields.push(...strippedFields);
	        const typeDefsWithoutTypeSystemDirectives = utils$1.stripTypeSystemDirectivesFromTypeDefs(typeDefsWithoutExternalFields);
	        for (const definition of typeDefsWithoutTypeSystemDirectives.definitions) {
	            if (definition.kind === graphql_1.Kind.OBJECT_TYPE_DEFINITION ||
	                definition.kind === graphql_1.Kind.OBJECT_TYPE_EXTENSION) {
	                const typeName = definition.name.value;
	                for (const keyDirective of utils$1.findDirectivesOnTypeOrField(definition, 'key')) {
	                    if (keyDirective.arguments &&
	                        utils$1.isStringValueNode(keyDirective.arguments[0].value)) {
	                        keyDirectivesMap[typeName] = keyDirectivesMap[typeName] || {};
	                        keyDirectivesMap[typeName][serviceName] =
	                            keyDirectivesMap[typeName][serviceName] || [];
	                        keyDirectivesMap[typeName][serviceName].push(utils$1.parseSelections(keyDirective.arguments[0].value.value));
	                    }
	                }
	            }
	            if (graphql_1.isTypeDefinitionNode(definition)) {
	                const typeName = definition.name.value;
	                if (!typeToServiceMap[typeName]) {
	                    typeToServiceMap[typeName] = {
	                        extensionFieldsToOwningServiceMap: Object.create(null),
	                    };
	                }
	                typeToServiceMap[typeName].owningService = serviceName;
	                if (typeDefinitionsMap[typeName]) {
	                    const isValueType = utils$1.typeNodesAreEquivalent(typeDefinitionsMap[typeName][typeDefinitionsMap[typeName].length - 1], definition);
	                    if (isValueType) {
	                        valueTypes.add(typeName);
	                    }
	                    typeDefinitionsMap[typeName].push({ ...definition, serviceName });
	                }
	                else {
	                    typeDefinitionsMap[typeName] = [{ ...definition, serviceName }];
	                }
	            }
	            else if (graphql_1.isTypeExtensionNode(definition)) {
	                const typeName = definition.name.value;
	                if (definition.kind === graphql_1.Kind.OBJECT_TYPE_EXTENSION ||
	                    definition.kind === graphql_1.Kind.INPUT_OBJECT_TYPE_EXTENSION) {
	                    if (!definition.fields)
	                        break;
	                    const fields = utils$1.mapFieldNamesToServiceName(definition.fields, serviceName);
	                    if (typeToServiceMap[typeName]) {
	                        typeToServiceMap[typeName].extensionFieldsToOwningServiceMap = {
	                            ...typeToServiceMap[typeName].extensionFieldsToOwningServiceMap,
	                            ...fields,
	                        };
	                    }
	                    else {
	                        typeToServiceMap[typeName] = {
	                            extensionFieldsToOwningServiceMap: fields,
	                        };
	                    }
	                }
	                if (definition.kind === graphql_1.Kind.ENUM_TYPE_EXTENSION) {
	                    if (!definition.values)
	                        break;
	                    const values = utils$1.mapFieldNamesToServiceName(definition.values, serviceName);
	                    if (typeToServiceMap[typeName]) {
	                        typeToServiceMap[typeName].extensionFieldsToOwningServiceMap = {
	                            ...typeToServiceMap[typeName].extensionFieldsToOwningServiceMap,
	                            ...values,
	                        };
	                    }
	                    else {
	                        typeToServiceMap[typeName] = {
	                            extensionFieldsToOwningServiceMap: values,
	                        };
	                    }
	                }
	                if (typeExtensionsMap[typeName]) {
	                    typeExtensionsMap[typeName].push({ ...definition, serviceName });
	                }
	                else {
	                    typeExtensionsMap[typeName] = [{ ...definition, serviceName }];
	                }
	            }
	            else if (definition.kind === graphql_1.Kind.DIRECTIVE_DEFINITION) {
	                const directiveName = definition.name.value;
	                const executableLocations = definition.locations.filter(location => utils$1.executableDirectiveLocations.includes(location.value));
	                if (executableLocations.length === 0)
	                    continue;
	                const definitionWithExecutableLocations = {
	                    ...definition,
	                    locations: executableLocations,
	                };
	                if (directiveDefinitionsMap[directiveName]) {
	                    directiveDefinitionsMap[directiveName][serviceName] = definitionWithExecutableLocations;
	                }
	                else {
	                    directiveDefinitionsMap[directiveName] = {
	                        [serviceName]: definitionWithExecutableLocations,
	                    };
	                }
	            }
	        }
	    }
	    if (!typeDefinitionsMap.Query)
	        typeDefinitionsMap.Query = [EmptyQueryDefinition];
	    if (typeExtensionsMap.Mutation && !typeDefinitionsMap.Mutation)
	        typeDefinitionsMap.Mutation = [EmptyMutationDefinition];
	    return {
	        typeToServiceMap,
	        typeDefinitionsMap,
	        typeExtensionsMap,
	        directiveDefinitionsMap,
	        externalFields,
	        keyDirectivesMap,
	        valueTypes,
	    };
	}
	exports.buildMapsFromServiceList = buildMapsFromServiceList;
	function buildSchemaFromDefinitionsAndExtensions({ typeDefinitionsMap, typeExtensionsMap, directiveDefinitionsMap, }) {
	    let errors = undefined;
	    let schema = new graphql_1.GraphQLSchema({
	        query: undefined,
	        directives: [...graphql_1.specifiedDirectives, ...directives_1.default],
	    });
	    function nodeHasInterfaces(node) {
	        return 'interfaces' in node;
	    }
	    const definitionsDocument = {
	        kind: graphql_1.Kind.DOCUMENT,
	        definitions: [
	            ...Object.values(typeDefinitionsMap).flatMap(typeDefinitions => {
	                if (!typeDefinitions.some(nodeHasInterfaces))
	                    return typeDefinitions;
	                const uniqueInterfaces = typeDefinitions.reduce((map, objectTypeDef) => {
	                    var _a;
	                    (_a = objectTypeDef.interfaces) === null || _a === void 0 ? void 0 : _a.forEach((iface) => map.set(iface.name.value, iface));
	                    return map;
	                }, new Map());
	                if (uniqueInterfaces.size === 0)
	                    return typeDefinitions;
	                const [first, ...rest] = typeDefinitions;
	                return [
	                    ...rest,
	                    {
	                        ...first,
	                        interfaces: Array.from(uniqueInterfaces.values()),
	                    },
	                ];
	            }),
	            ...Object.values(directiveDefinitionsMap).map(definitions => Object.values(definitions)[0]),
	        ],
	    };
	    errors = validate_1.validateSDL(definitionsDocument, schema, rules.compositionRules);
	    schema = graphql_1.extendSchema(schema, definitionsDocument, { assumeValidSDL: true });
	    const extensionsDocument = {
	        kind: graphql_1.Kind.DOCUMENT,
	        definitions: Object.values(typeExtensionsMap).flat(),
	    };
	    errors.push(...validate_1.validateSDL(extensionsDocument, schema, rules.compositionRules));
	    schema = graphql_1.extendSchema(schema, extensionsDocument, { assumeValidSDL: true });
	    schema = new graphql_1.GraphQLSchema({
	        ...schema.toConfig(),
	        directives: [
	            ...schema.getDirectives().filter(x => !utils$1.isFederationDirective(x)),
	        ],
	    });
	    return { schema, errors };
	}
	exports.buildSchemaFromDefinitionsAndExtensions = buildSchemaFromDefinitionsAndExtensions;
	function addFederationMetadataToSchemaNodes({ schema, typeToServiceMap, externalFields, keyDirectivesMap, valueTypes, directiveDefinitionsMap, }) {
	    var _a;
	    for (const [typeName, { owningService, extensionFieldsToOwningServiceMap },] of Object.entries(typeToServiceMap)) {
	        const namedType = schema.getType(typeName);
	        if (!namedType)
	            continue;
	        const isValueType = valueTypes.has(typeName);
	        const serviceName = isValueType ? null : owningService;
	        const federationMetadata = {
	            ...utils$1.getFederationMetadata(namedType),
	            serviceName,
	            isValueType,
	            ...(keyDirectivesMap[typeName] && {
	                keys: keyDirectivesMap[typeName],
	            }),
	        };
	        namedType.extensions = {
	            ...namedType.extensions,
	            federation: federationMetadata,
	        };
	        if (graphql_1.isObjectType(namedType)) {
	            for (const field of Object.values(namedType.getFields())) {
	                const [providesDirective] = utils$1.findDirectivesOnTypeOrField(field.astNode, 'provides');
	                if (providesDirective &&
	                    providesDirective.arguments &&
	                    utils$1.isStringValueNode(providesDirective.arguments[0].value)) {
	                    const fieldFederationMetadata = {
	                        ...utils$1.getFederationMetadata(field),
	                        serviceName,
	                        provides: utils$1.parseSelections(providesDirective.arguments[0].value.value),
	                        belongsToValueType: isValueType,
	                    };
	                    field.extensions = {
	                        ...field.extensions,
	                        federation: fieldFederationMetadata
	                    };
	                }
	            }
	        }
	        for (const [fieldName, extendingServiceName] of Object.entries(extensionFieldsToOwningServiceMap)) {
	            if (graphql_1.isObjectType(namedType)) {
	                const field = namedType.getFields()[fieldName];
	                const fieldFederationMetadata = {
	                    ...utils$1.getFederationMetadata(field),
	                    serviceName: extendingServiceName,
	                };
	                field.extensions = {
	                    ...field.extensions,
	                    federation: fieldFederationMetadata,
	                };
	                const [requiresDirective] = utils$1.findDirectivesOnTypeOrField(field.astNode, 'requires');
	                if (requiresDirective &&
	                    requiresDirective.arguments &&
	                    utils$1.isStringValueNode(requiresDirective.arguments[0].value)) {
	                    const fieldFederationMetadata = {
	                        ...utils$1.getFederationMetadata(field),
	                        requires: utils$1.parseSelections(requiresDirective.arguments[0].value.value),
	                    };
	                    field.extensions = {
	                        ...field.extensions,
	                        federation: fieldFederationMetadata,
	                    };
	                }
	            }
	        }
	    }
	    for (const field of externalFields) {
	        const namedType = schema.getType(field.parentTypeName);
	        if (!namedType)
	            continue;
	        const existingMetadata = utils$1.getFederationMetadata(namedType);
	        const typeFederationMetadata = {
	            ...existingMetadata,
	            externals: {
	                ...existingMetadata === null || existingMetadata === void 0 ? void 0 : existingMetadata.externals,
	                [field.serviceName]: [
	                    ...(((_a = existingMetadata === null || existingMetadata === void 0 ? void 0 : existingMetadata.externals) === null || _a === void 0 ? void 0 : _a[field.serviceName]) || []),
	                    field,
	                ],
	            },
	        };
	        namedType.extensions = {
	            ...namedType.extensions,
	            federation: typeFederationMetadata,
	        };
	    }
	    for (const directiveName of Object.keys(directiveDefinitionsMap)) {
	        const directive = schema.getDirective(directiveName);
	        if (!directive)
	            continue;
	        const directiveFederationMetadata = {
	            ...utils$1.getFederationMetadata(directive),
	            directiveDefinitions: directiveDefinitionsMap[directiveName],
	        };
	        directive.extensions = {
	            ...directive.extensions,
	            federation: directiveFederationMetadata,
	        };
	    }
	}
	exports.addFederationMetadataToSchemaNodes = addFederationMetadataToSchemaNodes;
	function composeServices(services) {
	    const { typeToServiceMap, typeDefinitionsMap, typeExtensionsMap, directiveDefinitionsMap, externalFields, keyDirectivesMap, valueTypes, } = buildMapsFromServiceList(services);
	    let { schema, errors } = buildSchemaFromDefinitionsAndExtensions({
	        typeDefinitionsMap,
	        typeExtensionsMap,
	        directiveDefinitionsMap,
	    });
	    schema = new graphql_1.GraphQLSchema({
	        ...schema.toConfig(),
	        ...utils$1.mapValues(utils$1.defaultRootOperationNameLookup, typeName => typeName
	            ? schema.getType(typeName)
	            : undefined),
	        extensions: {
	            serviceList: services
	        }
	    });
	    schema = lib$1.transformSchema(schema, type => {
	        if (graphql_1.isObjectType(type)) {
	            const config = type.toConfig();
	            return new graphql_1.GraphQLObjectType({
	                ...config,
	                interfaces: Array.from(new Set(config.interfaces)),
	            });
	        }
	        return undefined;
	    });
	    addFederationMetadataToSchemaNodes({
	        schema,
	        typeToServiceMap,
	        externalFields,
	        keyDirectivesMap,
	        valueTypes,
	        directiveDefinitionsMap,
	    });
	    return { schema, errors };
	}
	exports.composeServices = composeServices;

	});

	var rootFieldUsed = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.rootFieldUsed = void 0;


	exports.rootFieldUsed = ({ name: serviceName, typeDefs, }) => {
	    const errors = [];
	    const defaultRootOperationNames = Object.values(utils$1.defaultRootOperationNameLookup);
	    const disallowedTypeNames = {};
	    let hasSchemaDefinitionOrExtension = false;
	    graphql_1.visit(typeDefs, {
	        OperationTypeDefinition(node) {
	            hasSchemaDefinitionOrExtension = true;
	            if (!defaultRootOperationNames.includes(node.type.name
	                .value)) {
	                disallowedTypeNames[utils$1.defaultRootOperationNameLookup[node.operation]] = true;
	            }
	        },
	    });
	    if (hasSchemaDefinitionOrExtension) {
	        graphql_1.visit(typeDefs, {
	            ObjectTypeDefinition: visitType,
	            ObjectTypeExtension: visitType,
	        });
	        function visitType(node) {
	            if (disallowedTypeNames[node.name.value]) {
	                const rootOperationName = node.name.value;
	                errors.push(utils$1.errorWithCode(`ROOT_${rootOperationName.toUpperCase()}_USED`, utils$1.logServiceAndType(serviceName, rootOperationName) +
	                    `Found invalid use of default root operation name \`${rootOperationName}\`. \`${rootOperationName}\` is disallowed when \`Schema.${rootOperationName.toLowerCase()}\` is set to a type other than \`${rootOperationName}\`.`));
	            }
	        }
	    }
	    return errors;
	};

	});

	var preNormalization = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });

	Object.defineProperty(exports, "rootFieldUsed", { enumerable: true, get: function () { return rootFieldUsed.rootFieldUsed; } });

	});

	var externalUsedOnBase = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.externalUsedOnBase = void 0;


	exports.externalUsedOnBase = ({ name: serviceName, typeDefs, }) => {
	    const errors = [];
	    graphql_1.visit(typeDefs, {
	        ObjectTypeDefinition(typeDefinition) {
	            if (typeDefinition.fields) {
	                for (const field of typeDefinition.fields) {
	                    if (field.directives) {
	                        for (const directive of field.directives) {
	                            const name = directive.name.value;
	                            if (name === 'external') {
	                                errors.push(utils$1.errorWithCode('EXTERNAL_USED_ON_BASE', utils$1.logServiceAndType(serviceName, typeDefinition.name.value, field.name.value) +
	                                    `Found extraneous @external directive. @external cannot be used on base types.`));
	                            }
	                        }
	                    }
	                }
	            }
	        },
	    });
	    return errors;
	};

	});

	var requiresUsedOnBase = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.requiresUsedOnBase = void 0;


	exports.requiresUsedOnBase = ({ name: serviceName, typeDefs, }) => {
	    const errors = [];
	    graphql_1.visit(typeDefs, {
	        ObjectTypeDefinition(typeDefinition) {
	            if (typeDefinition.fields) {
	                for (const field of typeDefinition.fields) {
	                    if (field.directives) {
	                        for (const directive of field.directives) {
	                            const name = directive.name.value;
	                            if (name === 'requires') {
	                                errors.push(utils$1.errorWithCode('REQUIRES_USED_ON_BASE', utils$1.logServiceAndType(serviceName, typeDefinition.name.value, field.name.value) +
	                                    `Found extraneous @requires directive. @requires cannot be used on base types.`));
	                            }
	                        }
	                    }
	                }
	            }
	        },
	    });
	    return errors;
	};

	});

	var keyFieldsMissingExternal = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.keyFieldsMissingExternal = void 0;




	exports.keyFieldsMissingExternal = ({ name: serviceName, typeDefs, }) => {
	    const errors = [];
	    let keyDirectiveInfoOnTypeExtensions = [];
	    graphql_1.visit(typeDefs, {
	        ObjectTypeExtension(node) {
	            const keyDirectivesOnTypeExtension = utils$1.findDirectivesOnTypeOrField(node, 'key');
	            const keyDirectivesInfo = keyDirectivesOnTypeExtension
	                .map(keyDirective => keyDirective.arguments &&
	                utils$1.isStringValueNode(keyDirective.arguments[0].value)
	                ? {
	                    typeName: node.name.value,
	                    keyArgument: keyDirective.arguments[0].value.value,
	                }
	                : null)
	                .filter(utils$1.isNotNullOrUndefined);
	            keyDirectiveInfoOnTypeExtensions.push(...keyDirectivesInfo);
	        },
	    });
	    let schema = new graphql_1.GraphQLSchema({
	        query: undefined,
	        directives: [...graphql_1.specifiedDirectives, ...directives.federationDirectives],
	    });
	    try {
	        schema = lib$1.buildSchemaFromSDL(typeDefs, schema);
	    }
	    catch (e) {
	        errors.push(e);
	        return errors;
	    }
	    const typeInfo = new graphql_1.TypeInfo(schema);
	    for (const { typeName, keyArgument } of keyDirectiveInfoOnTypeExtensions) {
	        const keyDirectiveSelectionSet = graphql_1.parse(`fragment __generated on ${typeName} { ${keyArgument} }`);
	        graphql_1.visit(keyDirectiveSelectionSet, graphql_1.visitWithTypeInfo(typeInfo, {
	            Field() {
	                const fieldDef = typeInfo.getFieldDef();
	                const parentType = typeInfo.getParentType();
	                if (parentType) {
	                    if (!fieldDef) {
	                        errors.push(utils$1.errorWithCode('KEY_FIELDS_MISSING_EXTERNAL', utils$1.logServiceAndType(serviceName, parentType.name) +
	                            `A @key directive specifies a field which is not found in this service. Add a field to this type with @external.`));
	                        return;
	                    }
	                    const externalDirectivesOnField = utils$1.findDirectivesOnTypeOrField(fieldDef.astNode, 'external');
	                    if (externalDirectivesOnField.length === 0) {
	                        errors.push(utils$1.errorWithCode('KEY_FIELDS_MISSING_EXTERNAL', utils$1.logServiceAndType(serviceName, parentType.name) +
	                            `A @key directive specifies the \`${fieldDef.name}\` field which has no matching @external field.`));
	                    }
	                }
	            },
	        }));
	    }
	    return errors;
	};

	});

	var reservedFieldUsed = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.reservedFieldUsed = void 0;


	exports.reservedFieldUsed = ({ name: serviceName, typeDefs, }) => {
	    const errors = [];
	    let rootQueryName = 'Query';
	    graphql_1.visit(typeDefs, {
	        OperationTypeDefinition(node) {
	            if (node.operation === 'query') {
	                rootQueryName = node.type.name.value;
	            }
	        },
	    });
	    graphql_1.visit(typeDefs, {
	        ObjectTypeDefinition(node) {
	            if (node.name.value === rootQueryName && node.fields) {
	                for (const field of node.fields) {
	                    const { value: fieldName } = field.name;
	                    if (utils$1.reservedRootFields.includes(fieldName)) {
	                        errors.push(utils$1.errorWithCode('RESERVED_FIELD_USED', utils$1.logServiceAndType(serviceName, rootQueryName, fieldName) +
	                            `${fieldName} is a field reserved for federation and can\'t be used at the Query root.`));
	                    }
	                }
	            }
	        },
	    });
	    return errors;
	};

	});

	var duplicateEnumOrScalar = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.duplicateEnumOrScalar = void 0;


	exports.duplicateEnumOrScalar = ({ name: serviceName, typeDefs, }) => {
	    const errors = [];
	    const enums = [];
	    const scalars = [];
	    graphql_1.visit(typeDefs, {
	        EnumTypeDefinition(definition) {
	            const name = definition.name.value;
	            if (enums.includes(name)) {
	                errors.push(utils$1.errorWithCode('DUPLICATE_ENUM_DEFINITION', utils$1.logServiceAndType(serviceName, name) +
	                    `The enum, \`${name}\` was defined multiple times in this service. Remove one of the definitions for \`${name}\``));
	                return definition;
	            }
	            enums.push(name);
	            return definition;
	        },
	        ScalarTypeDefinition(definition) {
	            const name = definition.name.value;
	            if (scalars.includes(name)) {
	                errors.push(utils$1.errorWithCode('DUPLICATE_SCALAR_DEFINITION', utils$1.logServiceAndType(serviceName, name) +
	                    `The scalar, \`${name}\` was defined multiple times in this service. Remove one of the definitions for \`${name}\``));
	                return definition;
	            }
	            scalars.push(name);
	            return definition;
	        },
	    });
	    return errors;
	};

	});

	var duplicateEnumValue = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.duplicateEnumValue = void 0;


	exports.duplicateEnumValue = ({ name: serviceName, typeDefs, }) => {
	    const errors = [];
	    const enums = {};
	    graphql_1.visit(typeDefs, {
	        EnumTypeDefinition(definition) {
	            const name = definition.name.value;
	            const enumValues = definition.values && definition.values.map(value => value.name.value);
	            if (!enumValues)
	                return definition;
	            if (enums[name] && enums[name].length) {
	                enumValues.map(valueName => {
	                    if (enums[name].includes(valueName)) {
	                        errors.push(utils$1.errorWithCode('DUPLICATE_ENUM_VALUE', utils$1.logServiceAndType(serviceName, name, valueName) +
	                            `The enum, \`${name}\` has multiple definitions of the \`${valueName}\` value.`));
	                        return;
	                    }
	                    enums[name].push(valueName);
	                });
	            }
	            else {
	                enums[name] = enumValues;
	            }
	            return definition;
	        },
	        EnumTypeExtension(definition) {
	            const name = definition.name.value;
	            const enumValues = definition.values && definition.values.map(value => value.name.value);
	            if (!enumValues)
	                return definition;
	            if (enums[name] && enums[name].length) {
	                enumValues.map(valueName => {
	                    if (enums[name].includes(valueName)) {
	                        errors.push(utils$1.errorWithCode('DUPLICATE_ENUM_VALUE', utils$1.logServiceAndType(serviceName, name, valueName) +
	                            `The enum, \`${name}\` has multiple definitions of the \`${valueName}\` value.`));
	                        return;
	                    }
	                    enums[name].push(valueName);
	                });
	            }
	            else {
	                enums[name] = enumValues;
	            }
	            return definition;
	        },
	    });
	    return errors;
	};

	});

	var preComposition = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });

	Object.defineProperty(exports, "externalUsedOnBase", { enumerable: true, get: function () { return externalUsedOnBase.externalUsedOnBase; } });

	Object.defineProperty(exports, "requiresUsedOnBase", { enumerable: true, get: function () { return requiresUsedOnBase.requiresUsedOnBase; } });

	Object.defineProperty(exports, "keyFieldsMissingExternal", { enumerable: true, get: function () { return keyFieldsMissingExternal.keyFieldsMissingExternal; } });

	Object.defineProperty(exports, "reservedFieldUsed", { enumerable: true, get: function () { return reservedFieldUsed.reservedFieldUsed; } });

	Object.defineProperty(exports, "duplicateEnumOrScalar", { enumerable: true, get: function () { return duplicateEnumOrScalar.duplicateEnumOrScalar; } });

	Object.defineProperty(exports, "duplicateEnumValue", { enumerable: true, get: function () { return duplicateEnumValue.duplicateEnumValue; } });

	});

	var externalUnused = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.externalUnused = void 0;


	exports.externalUnused = ({ schema }) => {
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [parentTypeName, parentType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(parentType))
	            continue;
	        const typeFederationMetadata = utils$1.getFederationMetadata(parentType);
	        if (typeFederationMetadata) {
	            const { serviceName, keys } = typeFederationMetadata;
	            if (serviceName && keys && !keys[serviceName])
	                continue;
	        }
	        if (typeFederationMetadata === null || typeFederationMetadata === void 0 ? void 0 : typeFederationMetadata.externals) {
	            for (const [serviceName, externalFieldsForService] of Object.entries(typeFederationMetadata.externals)) {
	                for (const { field: externalField } of externalFieldsForService) {
	                    const externalFieldName = externalField.name.value;
	                    const hasMatchingKeyOnType = Boolean(utils$1.hasMatchingFieldInDirectives({
	                        directives: utils$1.findDirectivesOnTypeOrField(parentType.astNode, 'key'),
	                        fieldNameToMatch: externalFieldName,
	                        namedType: parentType,
	                    }));
	                    if (hasMatchingKeyOnType)
	                        continue;
	                    const hasMatchingProvidesOnAnotherType = utils$1.findFieldsThatReturnType({
	                        schema,
	                        typeToFind: parentType,
	                    }).some(field => utils$1.findDirectivesOnTypeOrField(field.astNode, 'provides').some(directive => {
	                        if (!directive.arguments)
	                            return false;
	                        const selections = utils$1.isStringValueNode(directive.arguments[0].value) &&
	                            utils$1.parseSelections(directive.arguments[0].value.value);
	                        return (selections &&
	                            selections.some(selection => selection.kind === graphql_1.Kind.FIELD &&
	                                selection.name.value === externalFieldName));
	                    }));
	                    if (hasMatchingProvidesOnAnotherType)
	                        continue;
	                    const hasMatchingRequiresOnAnotherType = Object.values(schema.getTypeMap()).some(namedType => {
	                        if (!graphql_1.isObjectType(namedType))
	                            return false;
	                        return Object.values(namedType.getFields()).some(field => utils$1.findDirectivesOnTypeOrField(field.astNode, 'requires').some(directive => {
	                            if (!directive.arguments)
	                                return false;
	                            const selections = utils$1.isStringValueNode(directive.arguments[0].value) &&
	                                utils$1.parseSelections(directive.arguments[0].value.value);
	                            if (!selections)
	                                return false;
	                            return utils$1.selectionIncludesField({
	                                selections,
	                                selectionSetType: namedType,
	                                typeToFind: parentType,
	                                fieldToFind: externalFieldName,
	                            });
	                        }));
	                    });
	                    if (hasMatchingRequiresOnAnotherType)
	                        continue;
	                    const hasMatchingRequiresOnType = Object.values(parentType.getFields()).some(maybeRequiresField => {
	                        var _a;
	                        const fieldOwner = (_a = utils$1.getFederationMetadata(maybeRequiresField)) === null || _a === void 0 ? void 0 : _a.serviceName;
	                        if (fieldOwner !== serviceName)
	                            return false;
	                        const requiresDirectives = utils$1.findDirectivesOnTypeOrField(maybeRequiresField.astNode, 'requires');
	                        return utils$1.hasMatchingFieldInDirectives({
	                            directives: requiresDirectives,
	                            fieldNameToMatch: externalFieldName,
	                            namedType: parentType,
	                        });
	                    });
	                    if (hasMatchingRequiresOnType)
	                        continue;
	                    const fieldsOnInterfacesImplementedByParentType = new Set();
	                    for (const _interface of parentType.getInterfaces()) {
	                        for (const fieldName in _interface.getFields()) {
	                            fieldsOnInterfacesImplementedByParentType.add(fieldName);
	                        }
	                    }
	                    if (fieldsOnInterfacesImplementedByParentType.has(externalFieldName)) {
	                        continue;
	                    }
	                    errors.push(utils$1.errorWithCode('EXTERNAL_UNUSED', utils$1.logServiceAndType(serviceName, parentTypeName, externalFieldName) +
	                        `is marked as @external but is not used by a @requires, @key, or @provides directive.`));
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var externalMissingOnBase = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.externalMissingOnBase = void 0;


	exports.externalMissingOnBase = ({ schema }) => {
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        const typeFederationMetadata = utils$1.getFederationMetadata(namedType);
	        if (typeFederationMetadata === null || typeFederationMetadata === void 0 ? void 0 : typeFederationMetadata.externals) {
	            for (const [serviceName, externalFieldsForService] of Object.entries(typeFederationMetadata.externals)) {
	                for (const { field: externalField } of externalFieldsForService) {
	                    const externalFieldName = externalField.name.value;
	                    const allFields = namedType.getFields();
	                    const matchingBaseField = allFields[externalFieldName];
	                    if (!matchingBaseField) {
	                        errors.push(utils$1.errorWithCode('EXTERNAL_MISSING_ON_BASE', utils$1.logServiceAndType(serviceName, typeName, externalFieldName) +
	                            `marked @external but ${externalFieldName} is not defined on the base service of ${typeName} (${typeFederationMetadata.serviceName})`));
	                        continue;
	                    }
	                    const fieldFederationMetadata = utils$1.getFederationMetadata(matchingBaseField);
	                    if (fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.serviceName) {
	                        errors.push(utils$1.errorWithCode('EXTERNAL_MISSING_ON_BASE', utils$1.logServiceAndType(serviceName, typeName, externalFieldName) +
	                            `marked @external but ${externalFieldName} was defined in ${fieldFederationMetadata.serviceName}, not in the service that owns ${typeName} (${typeFederationMetadata.serviceName})`));
	                    }
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var externalTypeMismatch = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.externalTypeMismatch = void 0;


	exports.externalTypeMismatch = ({ schema }) => {
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        const typeFederationMetadata = utils$1.getFederationMetadata(namedType);
	        if (typeFederationMetadata === null || typeFederationMetadata === void 0 ? void 0 : typeFederationMetadata.externals) {
	            for (const [serviceName, externalFieldsForService] of Object.entries(typeFederationMetadata.externals)) {
	                for (const { field: externalField } of externalFieldsForService) {
	                    const externalFieldName = externalField.name.value;
	                    const allFields = namedType.getFields();
	                    const matchingBaseField = allFields[externalFieldName];
	                    const externalFieldType = graphql_1.typeFromAST(schema, externalField.type);
	                    if (!externalFieldType) {
	                        errors.push(utils$1.errorWithCode('EXTERNAL_TYPE_MISMATCH', utils$1.logServiceAndType(serviceName, typeName, externalFieldName) +
	                            `the type of the @external field does not exist in the resulting composed schema`));
	                    }
	                    else if (matchingBaseField &&
	                        !graphql_1.isEqualType(matchingBaseField.type, externalFieldType)) {
	                        errors.push(utils$1.errorWithCode('EXTERNAL_TYPE_MISMATCH', utils$1.logServiceAndType(serviceName, typeName, externalFieldName) +
	                            `Type \`${externalFieldType}\` does not match the type of the original field in ${typeFederationMetadata.serviceName} (\`${matchingBaseField.type}\`)`));
	                    }
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var requiresFieldsMissingExternal = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.requiresFieldsMissingExternal = void 0;


	exports.requiresFieldsMissingExternal = ({ schema, }) => {
	    var _a;
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        for (const [fieldName, field] of Object.entries(namedType.getFields())) {
	            const fieldFederationMetadata = utils$1.getFederationMetadata(field);
	            const serviceName = fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.serviceName;
	            if (!serviceName)
	                continue;
	            if (fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.requires) {
	                const typeFederationMetadata = utils$1.getFederationMetadata(namedType);
	                const externalFieldsOnTypeForService = (_a = typeFederationMetadata === null || typeFederationMetadata === void 0 ? void 0 : typeFederationMetadata.externals) === null || _a === void 0 ? void 0 : _a[serviceName];
	                const selections = fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.requires;
	                for (const selection of selections) {
	                    const foundMatchingExternal = externalFieldsOnTypeForService
	                        ? externalFieldsOnTypeForService.some(ext => ext.field.name.value === selection.name.value)
	                        : undefined;
	                    if (!foundMatchingExternal) {
	                        errors.push(utils$1.errorWithCode('REQUIRES_FIELDS_MISSING_EXTERNAL', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                            `requires the field \`${selection.name.value}\` to be marked as @external.`));
	                    }
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var requiresFieldsMissingOnBase = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.requiresFieldsMissingOnBase = void 0;


	exports.requiresFieldsMissingOnBase = ({ schema, }) => {
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        for (const [fieldName, field] of Object.entries(namedType.getFields())) {
	            const fieldFederationMetadata = utils$1.getFederationMetadata(field);
	            const serviceName = fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.serviceName;
	            if (!serviceName)
	                continue;
	            if (fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.requires) {
	                const selections = fieldFederationMetadata.requires;
	                for (const selection of selections) {
	                    const matchingFieldOnType = namedType.getFields()[selection.name.value];
	                    const typeFederationMetadata = utils$1.getFederationMetadata(matchingFieldOnType);
	                    if (typeFederationMetadata === null || typeFederationMetadata === void 0 ? void 0 : typeFederationMetadata.serviceName) {
	                        errors.push(utils$1.errorWithCode('REQUIRES_FIELDS_MISSING_ON_BASE', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                            `requires the field \`${selection.name.value}\` to be @external. @external fields must exist on the base type, not an extension.`));
	                    }
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var keyFieldsMissingOnBase = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.keyFieldsMissingOnBase = void 0;


	exports.keyFieldsMissingOnBase = ({ schema, }) => {
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        const typeFederationMetadata = utils$1.getFederationMetadata(namedType);
	        if (typeFederationMetadata === null || typeFederationMetadata === void 0 ? void 0 : typeFederationMetadata.keys) {
	            const allFieldsInType = namedType.getFields();
	            for (const [serviceName, selectionSets] of Object.entries(typeFederationMetadata.keys)) {
	                for (const selectionSet of selectionSets) {
	                    for (const field of selectionSet) {
	                        const name = field.name.value;
	                        const matchingField = allFieldsInType[name];
	                        if (matchingField) {
	                            const fieldFederationMetadata = utils$1.getFederationMetadata(matchingField);
	                            if (fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.serviceName) {
	                                errors.push(utils$1.errorWithCode('KEY_FIELDS_MISSING_ON_BASE', utils$1.logServiceAndType(serviceName, typeName) +
	                                    `A @key selects ${name}, but ${typeName}.${name} was either created or overwritten by ${fieldFederationMetadata.serviceName}, not ${serviceName}`));
	                            }
	                        }
	                    }
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var keyFieldsSelectInvalidType = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.keyFieldsSelectInvalidType = void 0;


	exports.keyFieldsSelectInvalidType = ({ schema, }) => {
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        const typeFederationMetadata = utils$1.getFederationMetadata(namedType);
	        if (typeFederationMetadata === null || typeFederationMetadata === void 0 ? void 0 : typeFederationMetadata.keys) {
	            const allFieldsInType = namedType.getFields();
	            for (const [serviceName, selectionSets] of Object.entries(typeFederationMetadata.keys)) {
	                for (const selectionSet of selectionSets) {
	                    for (const field of selectionSet) {
	                        const name = field.name.value;
	                        const matchingField = allFieldsInType[name];
	                        if (!matchingField) {
	                            errors.push(utils$1.errorWithCode('KEY_FIELDS_SELECT_INVALID_TYPE', utils$1.logServiceAndType(serviceName, typeName) +
	                                `A @key selects ${name}, but ${typeName}.${name} could not be found`));
	                        }
	                        if (matchingField) {
	                            if (graphql_1.isInterfaceType(matchingField.type) ||
	                                (graphql_1.isNonNullType(matchingField.type) &&
	                                    graphql_1.isInterfaceType(graphql_1.getNullableType(matchingField.type)))) {
	                                errors.push(utils$1.errorWithCode('KEY_FIELDS_SELECT_INVALID_TYPE', utils$1.logServiceAndType(serviceName, typeName) +
	                                    `A @key selects ${typeName}.${name}, which is an interface type. Keys cannot select interfaces.`));
	                            }
	                            if (graphql_1.isUnionType(matchingField.type) ||
	                                (graphql_1.isNonNullType(matchingField.type) &&
	                                    graphql_1.isUnionType(graphql_1.getNullableType(matchingField.type)))) {
	                                errors.push(utils$1.errorWithCode('KEY_FIELDS_SELECT_INVALID_TYPE', utils$1.logServiceAndType(serviceName, typeName) +
	                                    `A @key selects ${typeName}.${name}, which is a union type. Keys cannot select union types.`));
	                            }
	                        }
	                    }
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var providesFieldsMissingExternal = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.providesFieldsMissingExternal = void 0;


	exports.providesFieldsMissingExternal = ({ schema, }) => {
	    var _a;
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        for (const [fieldName, field] of Object.entries(namedType.getFields())) {
	            const fieldFederationMetadata = utils$1.getFederationMetadata(field);
	            const serviceName = fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.serviceName;
	            if (!serviceName)
	                continue;
	            const fieldType = field.type;
	            if (!graphql_1.isObjectType(fieldType))
	                continue;
	            const fieldTypeFederationMetadata = utils$1.getFederationMetadata(fieldType);
	            const externalFieldsOnTypeForService = (_a = fieldTypeFederationMetadata === null || fieldTypeFederationMetadata === void 0 ? void 0 : fieldTypeFederationMetadata.externals) === null || _a === void 0 ? void 0 : _a[serviceName];
	            if (fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.provides) {
	                const selections = fieldFederationMetadata.provides;
	                for (const selection of selections) {
	                    const foundMatchingExternal = externalFieldsOnTypeForService
	                        ? externalFieldsOnTypeForService.some(ext => ext.field.name.value === selection.name.value)
	                        : undefined;
	                    if (!foundMatchingExternal) {
	                        errors.push(utils$1.errorWithCode('PROVIDES_FIELDS_MISSING_EXTERNAL', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                            `provides the field \`${selection.name.value}\` and requires ${fieldType}.${selection.name.value} to be marked as @external.`));
	                    }
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var providesFieldsSelectInvalidType = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.providesFieldsSelectInvalidType = void 0;


	exports.providesFieldsSelectInvalidType = ({ schema, }) => {
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        for (const [fieldName, field] of Object.entries(namedType.getFields())) {
	            const fieldFederationMetadata = utils$1.getFederationMetadata(field);
	            const serviceName = fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.serviceName;
	            if (!serviceName)
	                continue;
	            const fieldType = field.type;
	            if (!graphql_1.isObjectType(fieldType))
	                continue;
	            const allFields = fieldType.getFields();
	            if (fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.provides) {
	                const selections = fieldFederationMetadata.provides;
	                for (const selection of selections) {
	                    const name = selection.name.value;
	                    const matchingField = allFields[name];
	                    if (!matchingField) {
	                        errors.push(utils$1.errorWithCode('PROVIDES_FIELDS_SELECT_INVALID_TYPE', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                            `A @provides selects ${name}, but ${fieldType.name}.${name} could not be found`));
	                        continue;
	                    }
	                    if (graphql_1.isListType(matchingField.type) ||
	                        (graphql_1.isNonNullType(matchingField.type) &&
	                            graphql_1.isListType(graphql_1.getNullableType(matchingField.type)))) {
	                        errors.push(utils$1.errorWithCode('PROVIDES_FIELDS_SELECT_INVALID_TYPE', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                            `A @provides selects ${fieldType.name}.${name}, which is a list type. A field cannot @provide lists.`));
	                    }
	                    if (graphql_1.isInterfaceType(matchingField.type) ||
	                        (graphql_1.isNonNullType(matchingField.type) &&
	                            graphql_1.isInterfaceType(graphql_1.getNullableType(matchingField.type)))) {
	                        errors.push(utils$1.errorWithCode('PROVIDES_FIELDS_SELECT_INVALID_TYPE', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                            `A @provides selects ${fieldType.name}.${name}, which is an interface type. A field cannot @provide interfaces.`));
	                    }
	                    if (graphql_1.isUnionType(matchingField.type) ||
	                        (graphql_1.isNonNullType(matchingField.type) &&
	                            graphql_1.isUnionType(graphql_1.getNullableType(matchingField.type)))) {
	                        errors.push(utils$1.errorWithCode('PROVIDES_FIELDS_SELECT_INVALID_TYPE', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                            `A @provides selects ${fieldType.name}.${name}, which is a union type. A field cannot @provide union types.`));
	                    }
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var providesNotOnEntity = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.providesNotOnEntity = void 0;


	exports.providesNotOnEntity = ({ schema }) => {
	    var _a;
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [typeName, namedType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(namedType))
	            continue;
	        for (const [fieldName, field] of Object.entries(namedType.getFields())) {
	            const fieldFederationMetadata = utils$1.getFederationMetadata(field);
	            const serviceName = fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.serviceName;
	            if (!serviceName && (fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.provides) &&
	                !(fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.belongsToValueType))
	                throw Error('Internal Consistency Error: field with provides information does not have service name.');
	            if (!serviceName)
	                continue;
	            const getBaseType = (type) => graphql_1.isListType(type) || graphql_1.isNonNullType(type)
	                ? getBaseType(type.ofType)
	                : type;
	            const baseType = getBaseType(field.type);
	            if (fieldFederationMetadata === null || fieldFederationMetadata === void 0 ? void 0 : fieldFederationMetadata.provides) {
	                if (!graphql_1.isObjectType(baseType)) {
	                    errors.push(utils$1.errorWithCode('PROVIDES_NOT_ON_ENTITY', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                        `uses the @provides directive but \`${typeName}.${fieldName}\` returns \`${field.type}\`, which is not an Object or List type. @provides can only be used on Object types with at least one @key, or Lists of such Objects.`));
	                    continue;
	                }
	                const fieldType = types[baseType.name];
	                const selectedFieldIsEntity = (_a = utils$1.getFederationMetadata(fieldType)) === null || _a === void 0 ? void 0 : _a.keys;
	                if (!selectedFieldIsEntity) {
	                    errors.push(utils$1.errorWithCode('PROVIDES_NOT_ON_ENTITY', utils$1.logServiceAndType(serviceName, typeName, fieldName) +
	                        `uses the @provides directive but \`${typeName}.${fieldName}\` does not return a type that has a @key. Try adding a @key to the \`${baseType}\` type.`));
	                }
	            }
	        }
	    }
	    return errors;
	};

	});

	var executableDirectivesInAllServices = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.executableDirectivesInAllServices = void 0;


	exports.executableDirectivesInAllServices = ({ schema, serviceList, }) => {
	    const errors = [];
	    const customExecutableDirectives = schema
	        .getDirectives()
	        .filter(x => !utils$1.isFederationDirective(x) && !graphql_1.isSpecifiedDirective(x));
	    customExecutableDirectives.forEach(directive => {
	        const directiveFederationMetadata = utils$1.getFederationMetadata(directive);
	        if (!directiveFederationMetadata)
	            return;
	        const allServiceNames = serviceList.map(({ name }) => name);
	        const serviceNamesWithDirective = Object.keys(directiveFederationMetadata.directiveDefinitions);
	        const serviceNamesWithoutDirective = allServiceNames.reduce((without, serviceName) => {
	            if (!serviceNamesWithDirective.includes(serviceName)) {
	                without.push(serviceName);
	            }
	            return without;
	        }, []);
	        if (serviceNamesWithoutDirective.length > 0) {
	            errors.push(utils$1.errorWithCode('EXECUTABLE_DIRECTIVES_IN_ALL_SERVICES', utils$1.logDirective(directive.name) +
	                `Custom directives must be implemented in every service. The following services do not implement the @${directive.name} directive: ${serviceNamesWithoutDirective.join(', ')}.`));
	        }
	    });
	    return errors;
	};

	});

	var executableDirectivesIdentical = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.executableDirectivesIdentical = void 0;


	exports.executableDirectivesIdentical = ({ schema, }) => {
	    const errors = [];
	    const customDirectives = schema
	        .getDirectives()
	        .filter(x => !utils$1.isFederationDirective(x) && !graphql_1.isSpecifiedDirective(x));
	    customDirectives.forEach(directive => {
	        const directiveFederationMetadata = utils$1.getFederationMetadata(directive);
	        if (!directiveFederationMetadata)
	            return;
	        const definitions = Object.entries(directiveFederationMetadata.directiveDefinitions);
	        const shouldError = definitions.some(([, definition], index) => {
	            if (index === 0)
	                return;
	            const [, previousDefinition] = definitions[index - 1];
	            return !utils$1.typeNodesAreEquivalent(definition, previousDefinition);
	        });
	        if (shouldError) {
	            errors.push(utils$1.errorWithCode('EXECUTABLE_DIRECTIVES_IDENTICAL', utils$1.logDirective(directive.name) +
	                `custom directives must be defined identically across all services. See below for a list of current implementations:\n${definitions
                    .map(([serviceName, definition]) => {
                    return `\t${serviceName}: ${graphql_1.print(definition)}`;
                })
                    .join('\n')}`));
	        }
	    });
	    return errors;
	};

	});

	var types = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.isFederationType = exports.federationTypes = exports.serviceField = exports.entitiesField = exports.AnyType = exports.ServiceType = exports.EntityType = void 0;

	exports.EntityType = new graphql_1.GraphQLUnionType({
	    name: '_Entity',
	    types: [],
	});
	exports.ServiceType = new graphql_1.GraphQLObjectType({
	    name: '_Service',
	    fields: {
	        sdl: {
	            type: graphql_1.GraphQLString,
	            description: 'The sdl representing the federated service capabilities. Includes federation directives, removes federation types, and includes rest of full schema after schema directives have been applied',
	        },
	    },
	});
	exports.AnyType = new graphql_1.GraphQLScalarType({
	    name: '_Any',
	    serialize(value) {
	        return value;
	    },
	});
	function isPromise(value) {
	    return Boolean(value && 'then' in value && typeof value.then === 'function');
	}
	function addTypeNameToPossibleReturn(maybeObject, typename) {
	    if (maybeObject !== null && typeof maybeObject === 'object') {
	        Object.defineProperty(maybeObject, '__typename', {
	            value: typename,
	        });
	    }
	    return maybeObject;
	}
	exports.entitiesField = {
	    type: new graphql_1.GraphQLNonNull(new graphql_1.GraphQLList(exports.EntityType)),
	    args: {
	        representations: {
	            type: new graphql_1.GraphQLNonNull(new graphql_1.GraphQLList(new graphql_1.GraphQLNonNull(exports.AnyType))),
	        },
	    },
	    resolve(_source, { representations }, context, info) {
	        return representations.map((reference) => {
	            const { __typename } = reference;
	            const type = info.schema.getType(__typename);
	            if (!type || !graphql_1.isObjectType(type)) {
	                throw new Error(`The _entities resolver tried to load an entity for type "${__typename}", but no object type of that name was found in the schema`);
	            }
	            const resolveReference = type.resolveReference
	                ? type.resolveReference
	                : function defaultResolveReference() {
	                    return reference;
	                };
	            const result = resolveReference(reference, context, info);
	            if (isPromise(result)) {
	                return result.then((x) => addTypeNameToPossibleReturn(x, __typename));
	            }
	            return addTypeNameToPossibleReturn(result, __typename);
	        });
	    },
	};
	exports.serviceField = {
	    type: new graphql_1.GraphQLNonNull(exports.ServiceType),
	};
	exports.federationTypes = [
	    exports.ServiceType,
	    exports.AnyType,
	    exports.EntityType,
	];
	function isFederationType(type) {
	    return (graphql_1.isNamedType(type) && exports.federationTypes.some(({ name }) => name === type.name));
	}
	exports.isFederationType = isFederationType;

	});

	var printFederatedSchema = createCommonjsModule(function (module, exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
	    Object.defineProperty(o, "default", { enumerable: true, value: v });
	}) : function(o, v) {
	    o["default"] = v;
	});
	var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || function (mod) {
	    if (mod && mod.__esModule) return mod;
	    var result = {};
	    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
	    __setModuleDefault(result, mod);
	    return result;
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.printBlockString = exports.printWithReducedWhitespace = exports.printType = exports.printIntrospectionSchema = exports.printSchema = void 0;



	const directives_1 = __importStar(directives);
	function printSchema(schema, options) {
	    return printFilteredSchema(schema, (n) => !graphql_1.isSpecifiedDirective(n) && !utils$1.isFederationDirective(n), isDefinedType, options);
	}
	exports.printSchema = printSchema;
	function printIntrospectionSchema(schema, options) {
	    return printFilteredSchema(schema, graphql_1.isSpecifiedDirective, graphql_1.isIntrospectionType, options);
	}
	exports.printIntrospectionSchema = printIntrospectionSchema;
	function isDefinedType(type) {
	    return (!graphql_1.isSpecifiedScalarType(type) &&
	        !graphql_1.isIntrospectionType(type) &&
	        !types.isFederationType(type));
	}
	function printFilteredSchema(schema, directiveFilter, typeFilter, options) {
	    const directives = schema.getDirectives().filter(directiveFilter);
	    const types = Object.values(schema.getTypeMap())
	        .sort((type1, type2) => type1.name.localeCompare(type2.name))
	        .filter(typeFilter);
	    return ([printSchemaDefinition(schema)]
	        .concat(directives.map(directive => printDirective(directive, options)), types.map(type => printType(type, options)))
	        .filter(Boolean)
	        .join('\n\n') + '\n');
	}
	function printSchemaDefinition(schema) {
	    if (isSchemaOfCommonNames(schema)) {
	        return;
	    }
	    const operationTypes = [];
	    const queryType = schema.getQueryType();
	    if (queryType) {
	        operationTypes.push(`  query: ${queryType.name}`);
	    }
	    const mutationType = schema.getMutationType();
	    if (mutationType) {
	        operationTypes.push(`  mutation: ${mutationType.name}`);
	    }
	    const subscriptionType = schema.getSubscriptionType();
	    if (subscriptionType) {
	        operationTypes.push(`  subscription: ${subscriptionType.name}`);
	    }
	    return `schema {\n${operationTypes.join('\n')}\n}`;
	}
	function isSchemaOfCommonNames(schema) {
	    const queryType = schema.getQueryType();
	    if (queryType && queryType.name !== 'Query') {
	        return false;
	    }
	    const mutationType = schema.getMutationType();
	    if (mutationType && mutationType.name !== 'Mutation') {
	        return false;
	    }
	    const subscriptionType = schema.getSubscriptionType();
	    if (subscriptionType && subscriptionType.name !== 'Subscription') {
	        return false;
	    }
	    return true;
	}
	function printType(type, options) {
	    if (graphql_1.isScalarType(type)) {
	        return printScalar(type, options);
	    }
	    else if (graphql_1.isObjectType(type)) {
	        return printObject(type, options);
	    }
	    else if (graphql_1.isInterfaceType(type)) {
	        return printInterface(type, options);
	    }
	    else if (graphql_1.isUnionType(type)) {
	        return printUnion(type, options);
	    }
	    else if (graphql_1.isEnumType(type)) {
	        return printEnum(type, options);
	    }
	    else if (graphql_1.isInputObjectType(type)) {
	        return printInputObject(type, options);
	    }
	    throw Error('Unexpected type: ' + type.toString());
	}
	exports.printType = printType;
	function printScalar(type, options) {
	    return printDescription(options, type) + `scalar ${type.name}`;
	}
	function printObject(type, options) {
	    const interfaces = type.getInterfaces();
	    const implementedInterfaces = interfaces.length
	        ? ' implements ' + interfaces.map(i => i.name).join(' & ')
	        : '';
	    const isExtension = type.extensionASTNodes && type.astNode && !type.astNode.fields;
	    return (printDescription(options, type) +
	        (isExtension ? 'extend ' : '') +
	        `type ${type.name}${implementedInterfaces}` +
	        printFederationDirectives(type) +
	        printFields(options, type));
	}
	function printInterface(type, options) {
	    const isExtension = type.extensionASTNodes && type.astNode && !type.astNode.fields;
	    return (printDescription(options, type) +
	        (isExtension ? 'extend ' : '') +
	        `interface ${type.name}` +
	        printFederationDirectives(type) +
	        printFields(options, type));
	}
	function printUnion(type, options) {
	    const types = type.getTypes();
	    const possibleTypes = types.length ? ' = ' + types.join(' | ') : '';
	    return printDescription(options, type) + 'union ' + type.name + possibleTypes;
	}
	function printEnum(type, options) {
	    const values = type
	        .getValues()
	        .map((value, i) => printDescription(options, value, '  ', !i) +
	        '  ' +
	        value.name +
	        printDeprecated(value));
	    return (printDescription(options, type) + `enum ${type.name}` + printBlock(values));
	}
	function printInputObject(type, options) {
	    const fields = Object.values(type.getFields()).map((f, i) => printDescription(options, f, '  ', !i) + '  ' + printInputValue(f));
	    return (printDescription(options, type) + `input ${type.name}` + printBlock(fields));
	}
	function printFields(options, type) {
	    const fields = Object.values(type.getFields()).map((f, i) => printDescription(options, f, '  ', !i) +
	        '  ' +
	        f.name +
	        printArgs(options, f.args, '  ') +
	        ': ' +
	        String(f.type) +
	        printDeprecated(f) +
	        printFederationDirectives(f));
	    return printBlock(fields);
	}
	function printFederationDirectives(type) {
	    if (!type.astNode)
	        return '';
	    if (graphql_1.isInputObjectType(type))
	        return '';
	    const allDirectives = directives_1.gatherDirectives(type)
	        .filter((n) => directives_1.default.some((fedDir) => fedDir.name === n.name.value))
	        .map(graphql_1.print);
	    const dedupedDirectives = [...new Set(allDirectives)];
	    return dedupedDirectives.length > 0 ? ' ' + dedupedDirectives.join(' ') : '';
	}
	function printWithReducedWhitespace(ast) {
	    return graphql_1.print(ast)
	        .replace(/\s+/g, ' ')
	        .trim();
	}
	exports.printWithReducedWhitespace = printWithReducedWhitespace;
	function printBlock(items) {
	    return items.length !== 0 ? ' {\n' + items.join('\n') + '\n}' : '';
	}
	function printArgs(options, args, indentation = '') {
	    if (args.length === 0) {
	        return '';
	    }
	    if (args.every(arg => !arg.description)) {
	        return '(' + args.map(printInputValue).join(', ') + ')';
	    }
	    return ('(\n' +
	        args
	            .map((arg, i) => printDescription(options, arg, '  ' + indentation, !i) +
	            '  ' +
	            indentation +
	            printInputValue(arg))
	            .join('\n') +
	        '\n' +
	        indentation +
	        ')');
	}
	function printInputValue(arg) {
	    const defaultAST = graphql_1.astFromValue(arg.defaultValue, arg.type);
	    let argDecl = arg.name + ': ' + String(arg.type);
	    if (defaultAST) {
	        argDecl += ` = ${graphql_1.print(defaultAST)}`;
	    }
	    return argDecl;
	}
	function printDirective(directive, options) {
	    return (printDescription(options, directive) +
	        'directive @' +
	        directive.name +
	        printArgs(options, directive.args) +
	        (directive.isRepeatable ? ' repeatable' : '') +
	        ' on ' +
	        directive.locations.join(' | '));
	}
	function printDeprecated(fieldOrEnumVal) {
	    if (!fieldOrEnumVal.isDeprecated) {
	        return '';
	    }
	    const reason = fieldOrEnumVal.deprecationReason;
	    const reasonAST = graphql_1.astFromValue(reason, graphql_1.GraphQLString);
	    if (reasonAST && reason !== '' && reason !== graphql_1.DEFAULT_DEPRECATION_REASON) {
	        return ' @deprecated(reason: ' + graphql_1.print(reasonAST) + ')';
	    }
	    return ' @deprecated';
	}
	function printDescription(options, def, indentation = '', firstInBlock = true) {
	    const { description } = def;
	    if (description == null) {
	        return '';
	    }
	    if ((options === null || options === void 0 ? void 0 : options.commentDescriptions) === true) {
	        return printDescriptionWithComments(description, indentation, firstInBlock);
	    }
	    const preferMultipleLines = description.length > 70;
	    const blockString = printBlockString(description, '', preferMultipleLines);
	    const prefix = indentation && !firstInBlock ? '\n' + indentation : indentation;
	    return prefix + blockString.replace(/\n/g, '\n' + indentation) + '\n';
	}
	function printDescriptionWithComments(description, indentation, firstInBlock) {
	    const prefix = indentation && !firstInBlock ? '\n' : '';
	    const comment = description
	        .split('\n')
	        .map(line => indentation + (line !== '' ? '# ' + line : '#'))
	        .join('\n');
	    return prefix + comment + '\n';
	}
	function printBlockString(value, indentation = '', preferMultipleLines = false) {
	    const isSingleLine = value.indexOf('\n') === -1;
	    const hasLeadingSpace = value[0] === ' ' || value[0] === '\t';
	    const hasTrailingQuote = value[value.length - 1] === '"';
	    const hasTrailingSlash = value[value.length - 1] === '\\';
	    const printAsMultipleLines = !isSingleLine ||
	        hasTrailingQuote ||
	        hasTrailingSlash ||
	        preferMultipleLines;
	    let result = '';
	    if (printAsMultipleLines && !(isSingleLine && hasLeadingSpace)) {
	        result += '\n' + indentation;
	    }
	    result += indentation ? value.replace(/\n/g, '\n' + indentation) : value;
	    if (printAsMultipleLines) {
	        result += '\n';
	    }
	    return '"""' + result.replace(/"""/g, '\\"""') + '"""';
	}
	exports.printBlockString = printBlockString;

	});

	var buildFederatedSchema_1 = createCommonjsModule(function (module, exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
	    Object.defineProperty(o, "default", { enumerable: true, value: v });
	}) : function(o, v) {
	    o["default"] = v;
	});
	var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || function (mod) {
	    if (mod && mod.__esModule) return mod;
	    var result = {};
	    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
	    __setModuleDefault(result, mod);
	    return result;
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.buildFederatedSchema = void 0;


	const directives_1 = __importStar(directives);


	function buildFederatedSchema(modulesOrSDL) {
	    let shapedModulesOrSDL;
	    if ('typeDefs' in modulesOrSDL) {
	        const { typeDefs, resolvers } = modulesOrSDL;
	        const augmentedTypeDefs = Array.isArray(typeDefs) ? typeDefs : [typeDefs];
	        shapedModulesOrSDL = augmentedTypeDefs.map((typeDefs, i) => {
	            const module = { typeDefs };
	            if (i === 0 && resolvers)
	                module.resolvers = resolvers;
	            return module;
	        });
	    }
	    else {
	        shapedModulesOrSDL = modulesOrSDL;
	    }
	    const modules = lib$1.modulesFromSDL(shapedModulesOrSDL);
	    let schema = lib$1.buildSchemaFromSDL(modules, new graphql_1.GraphQLSchema({
	        query: undefined,
	        directives: [...graphql_1.specifiedDirectives, ...directives_1.default],
	    }));
	    const sdl = printFederatedSchema.printSchema(schema);
	    if (!schema.getQueryType()) {
	        schema = new graphql_1.GraphQLSchema({
	            ...schema.toConfig(),
	            query: new graphql_1.GraphQLObjectType({
	                name: 'Query',
	                fields: {},
	            }),
	        });
	    }
	    const entityTypes = Object.values(schema.getTypeMap()).filter(type => graphql_1.isObjectType(type) && directives_1.typeIncludesDirective(type, 'key'));
	    const hasEntities = entityTypes.length > 0;
	    schema = lib$1.transformSchema(schema, type => {
	        if (graphql_1.isObjectType(type) && type === schema.getQueryType()) {
	            const config = type.toConfig();
	            return new graphql_1.GraphQLObjectType({
	                ...config,
	                fields: {
	                    ...(hasEntities && { _entities: types.entitiesField }),
	                    _service: {
	                        ...types.serviceField,
	                        resolve: () => ({ sdl }),
	                    },
	                    ...config.fields,
	                },
	            });
	        }
	        return undefined;
	    });
	    schema = lib$1.transformSchema(schema, type => {
	        if (hasEntities && graphql_1.isUnionType(type) && type.name === types.EntityType.name) {
	            return new graphql_1.GraphQLUnionType({
	                ...types.EntityType.toConfig(),
	                types: entityTypes.filter(graphql_1.isObjectType),
	            });
	        }
	        return undefined;
	    });
	    for (const module of modules) {
	        if (!module.resolvers)
	            continue;
	        lib$1.addResolversToSchema(schema, module.resolvers);
	    }
	    return schema;
	}
	exports.buildFederatedSchema = buildFederatedSchema;

	});

	var service = createCommonjsModule(function (module, exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
	    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(buildFederatedSchema_1, exports);
	__exportStar(printFederatedSchema, exports);

	});

	var keysMatchBaseService = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.keysMatchBaseService = void 0;



	exports.keysMatchBaseService = function ({ schema, }) {
	    const errors = [];
	    const types = schema.getTypeMap();
	    for (const [parentTypeName, parentType] of Object.entries(types)) {
	        if (!graphql_1.isObjectType(parentType))
	            continue;
	        const typeFederationMetadata = utils$1.getFederationMetadata(parentType);
	        if (typeFederationMetadata) {
	            const { serviceName, keys } = typeFederationMetadata;
	            if (serviceName && keys) {
	                if (!keys[serviceName]) {
	                    errors.push(utils$1.errorWithCode('KEY_MISSING_ON_BASE', utils$1.logServiceAndType(serviceName, parentTypeName) +
	                        `appears to be an entity but no @key directives are specified on the originating type.`));
	                    continue;
	                }
	                const availableKeys = keys[serviceName].map(printFieldSet);
	                Object.entries(keys)
	                    .filter(([service]) => service !== serviceName)
	                    .forEach(([extendingService, keyFields]) => {
	                    if (keyFields.length > 1) {
	                        errors.push(utils$1.errorWithCode('MULTIPLE_KEYS_ON_EXTENSION', utils$1.logServiceAndType(extendingService, parentTypeName) +
	                            `is extended from service ${serviceName} but specifies multiple @key directives. Extensions may only specify one @key.`));
	                        return;
	                    }
	                    const extensionKey = printFieldSet(keyFields[0]);
	                    if (!availableKeys.includes(extensionKey)) {
	                        errors.push(utils$1.errorWithCode('KEY_NOT_SPECIFIED', utils$1.logServiceAndType(extendingService, parentTypeName) +
	                            `extends from ${serviceName} but specifies an invalid @key directive. Valid @key directives are specified by the originating type. Available @key directives for this type are:\n` +
	                            `\t${availableKeys
                                .map((fieldSet) => `@key(fields: "${fieldSet}")`)
                                .join('\n\t')}`));
	                        return;
	                    }
	                });
	            }
	        }
	    }
	    return errors;
	};
	function printFieldSet(selections) {
	    return selections.map(service.printWithReducedWhitespace).join(' ');
	}

	});

	var postComposition = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });

	Object.defineProperty(exports, "externalUnused", { enumerable: true, get: function () { return externalUnused.externalUnused; } });

	Object.defineProperty(exports, "externalMissingOnBase", { enumerable: true, get: function () { return externalMissingOnBase.externalMissingOnBase; } });

	Object.defineProperty(exports, "externalTypeMismatch", { enumerable: true, get: function () { return externalTypeMismatch.externalTypeMismatch; } });

	Object.defineProperty(exports, "requiresFieldsMissingExternal", { enumerable: true, get: function () { return requiresFieldsMissingExternal.requiresFieldsMissingExternal; } });

	Object.defineProperty(exports, "requiresFieldsMissingOnBase", { enumerable: true, get: function () { return requiresFieldsMissingOnBase.requiresFieldsMissingOnBase; } });

	Object.defineProperty(exports, "keyFieldsMissingOnBase", { enumerable: true, get: function () { return keyFieldsMissingOnBase.keyFieldsMissingOnBase; } });

	Object.defineProperty(exports, "keyFieldsSelectInvalidType", { enumerable: true, get: function () { return keyFieldsSelectInvalidType.keyFieldsSelectInvalidType; } });

	Object.defineProperty(exports, "providesFieldsMissingExternal", { enumerable: true, get: function () { return providesFieldsMissingExternal.providesFieldsMissingExternal; } });

	Object.defineProperty(exports, "providesFieldsSelectInvalidType", { enumerable: true, get: function () { return providesFieldsSelectInvalidType.providesFieldsSelectInvalidType; } });

	Object.defineProperty(exports, "providesNotOnEntity", { enumerable: true, get: function () { return providesNotOnEntity.providesNotOnEntity; } });

	Object.defineProperty(exports, "executableDirectivesInAllServices", { enumerable: true, get: function () { return executableDirectivesInAllServices.executableDirectivesInAllServices; } });

	Object.defineProperty(exports, "executableDirectivesIdentical", { enumerable: true, get: function () { return executableDirectivesIdentical.executableDirectivesIdentical; } });

	Object.defineProperty(exports, "keysMatchBaseService", { enumerable: true, get: function () { return keysMatchBaseService.keysMatchBaseService; } });

	});

	var validate$2 = createCommonjsModule(function (module, exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
	    Object.defineProperty(o, "default", { enumerable: true, value: v });
	}) : function(o, v) {
	    o["default"] = v;
	});
	var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || function (mod) {
	    if (mod && mod.__esModule) return mod;
	    var result = {};
	    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
	    __setModuleDefault(result, mod);
	    return result;
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.validateComposedSchema = exports.validateServicesBeforeComposition = exports.validateServicesBeforeNormalization = void 0;

	const preNormalizationRules = __importStar(preNormalization);
	const preCompositionRules = __importStar(preComposition);
	const postCompositionRules = __importStar(postComposition);
	const preNormalizationValidators = Object.values(preNormalizationRules);
	function validateServicesBeforeNormalization(services) {
	    const errors = [];
	    for (const serviceDefinition of services) {
	        for (const validator of preNormalizationValidators) {
	            errors.push(...validator(serviceDefinition));
	        }
	    }
	    return errors;
	}
	exports.validateServicesBeforeNormalization = validateServicesBeforeNormalization;
	const preCompositionValidators = Object.values(preCompositionRules);
	exports.validateServicesBeforeComposition = (services) => {
	    const warningsOrErrors = [];
	    for (const serviceDefinition of services) {
	        for (const validator of preCompositionValidators) {
	            warningsOrErrors.push(...validator(serviceDefinition));
	        }
	    }
	    return warningsOrErrors;
	};
	const postCompositionValidators = Object.values(postCompositionRules);
	exports.validateComposedSchema = ({ schema, serviceList, }) => {
	    const warningsOrErrors = [];
	    warningsOrErrors.push(...graphql_1.validateSchema(schema));
	    for (const validator of postCompositionValidators) {
	        warningsOrErrors.push(...validator({ schema, serviceList }));
	    }
	    return warningsOrErrors;
	};

	});

	var normalize$1 = createCommonjsModule(function (module, exports) {
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.stripCommonPrimitives = exports.replaceExtendedDefinitionsWithExtensions = exports.defaultRootOperationTypes = exports.normalizeTypeDefs = void 0;


	const directives_1 = __importDefault(directives);
	function normalizeTypeDefs(typeDefs) {
	    return stripCommonPrimitives(defaultRootOperationTypes(replaceExtendedDefinitionsWithExtensions(typeDefs)));
	}
	exports.normalizeTypeDefs = normalizeTypeDefs;
	function defaultRootOperationTypes(typeDefs) {
	    const defaultRootOperationNames = Object.values(utils$1.defaultRootOperationNameLookup);
	    let rootOperationTypeMap = Object.create(null);
	    let hasSchemaDefinitionOrExtension = false;
	    graphql_1.visit(typeDefs, {
	        OperationTypeDefinition(node) {
	            hasSchemaDefinitionOrExtension = true;
	            rootOperationTypeMap[node.type.name.value] =
	                utils$1.defaultRootOperationNameLookup[node.operation];
	        },
	    });
	    if (!hasSchemaDefinitionOrExtension) {
	        rootOperationTypeMap = {
	            Query: 'Query',
	            Mutation: 'Mutation',
	            Subscription: 'Subscription',
	        };
	    }
	    let schemaWithoutConflictingDefaultDefinitions;
	    if (!hasSchemaDefinitionOrExtension) {
	        schemaWithoutConflictingDefaultDefinitions = typeDefs;
	    }
	    else {
	        schemaWithoutConflictingDefaultDefinitions = graphql_1.visit(typeDefs, {
	            ObjectTypeDefinition(node) {
	                if (defaultRootOperationNames.includes(node.name.value) &&
	                    !rootOperationTypeMap[node.name.value]) {
	                    return null;
	                }
	                return;
	            },
	            ObjectTypeExtension(node) {
	                if (defaultRootOperationNames.includes(node.name.value) &&
	                    !rootOperationTypeMap[node.name.value]) {
	                    return null;
	                }
	                return;
	            },
	            FieldDefinition(node) {
	                if (node.type.kind === graphql_1.Kind.NAMED_TYPE &&
	                    defaultRootOperationNames.includes(node.type.name.value)) {
	                    return null;
	                }
	                if (node.type.kind === graphql_1.Kind.NON_NULL_TYPE &&
	                    node.type.type.kind === graphql_1.Kind.NAMED_TYPE &&
	                    defaultRootOperationNames.includes(node.type.type.name.value)) {
	                    return null;
	                }
	                return;
	            },
	        });
	    }
	    const schemaWithDefaultRootTypes = graphql_1.visit(schemaWithoutConflictingDefaultDefinitions, {
	        SchemaDefinition() {
	            return null;
	        },
	        SchemaExtension() {
	            return null;
	        },
	        ObjectTypeDefinition(node) {
	            if (node.name.value in rootOperationTypeMap ||
	                defaultRootOperationNames.includes(node.name.value)) {
	                return {
	                    ...node,
	                    name: {
	                        ...node.name,
	                        value: rootOperationTypeMap[node.name.value] || node.name.value,
	                    },
	                    kind: graphql_1.Kind.OBJECT_TYPE_EXTENSION,
	                };
	            }
	            return;
	        },
	        ObjectTypeExtension(node) {
	            if (node.name.value in rootOperationTypeMap ||
	                defaultRootOperationNames.includes(node.name.value)) {
	                return {
	                    ...node,
	                    name: {
	                        ...node.name,
	                        value: rootOperationTypeMap[node.name.value] || node.name.value,
	                    },
	                };
	            }
	            return;
	        },
	        NamedType(node) {
	            if (node.name.value in rootOperationTypeMap) {
	                return {
	                    ...node,
	                    name: {
	                        ...node.name,
	                        value: rootOperationTypeMap[node.name.value],
	                    },
	                };
	            }
	            return;
	        },
	    });
	    return schemaWithDefaultRootTypes;
	}
	exports.defaultRootOperationTypes = defaultRootOperationTypes;
	function replaceExtendedDefinitionsWithExtensions(typeDefs) {
	    const typeDefsWithExtendedTypesReplaced = graphql_1.visit(typeDefs, {
	        ObjectTypeDefinition: visitor,
	        InterfaceTypeDefinition: visitor,
	    });
	    function visitor(node) {
	        const isExtensionDefinition = utils$1.findDirectivesOnTypeOrField(node, 'extends').length > 0;
	        if (!isExtensionDefinition) {
	            return node;
	        }
	        const filteredDirectives = node.directives &&
	            node.directives.filter(directive => directive.name.value !== 'extends');
	        return {
	            ...node,
	            ...(filteredDirectives && { directives: filteredDirectives }),
	            kind: utils$1.defKindToExtKind[node.kind],
	        };
	    }
	    return typeDefsWithExtendedTypesReplaced;
	}
	exports.replaceExtendedDefinitionsWithExtensions = replaceExtendedDefinitionsWithExtensions;
	function stripCommonPrimitives(document) {
	    const typeDefinitionVisitor = (node) => {
	        var _a;
	        if (node.name.value === utils$1.defaultRootOperationNameLookup.query) {
	            const filteredFieldDefinitions = (_a = node.fields) === null || _a === void 0 ? void 0 : _a.filter((fieldDefinition) => !utils$1.reservedRootFields.includes(fieldDefinition.name.value));
	            if (!filteredFieldDefinitions || filteredFieldDefinitions.length === 0) {
	                return null;
	            }
	            return {
	                ...node,
	                fields: filteredFieldDefinitions,
	            };
	        }
	        const isFederationType = node.name.value === '_Service';
	        return isFederationType ? null : node;
	    };
	    return graphql_1.visit(document, {
	        DirectiveDefinition(node) {
	            const isCommonDirective = [...directives_1.default, ...graphql_1.specifiedDirectives].some((directive) => directive.name === node.name.value);
	            return isCommonDirective ? null : node;
	        },
	        ScalarTypeDefinition(node) {
	            const isFederationScalar = ['_Any', '_FieldSet'].includes(node.name.value);
	            return isFederationScalar ? null : node;
	        },
	        UnionTypeDefinition(node) {
	            const isFederationUnion = node.name.value === "_Entity";
	            return isFederationUnion ? null : node;
	        },
	        ObjectTypeDefinition: typeDefinitionVisitor,
	        ObjectTypeExtension: typeDefinitionVisitor,
	    });
	}
	exports.stripCommonPrimitives = stripCommonPrimitives;

	});

	var _default = `
directive @cs__key(graph: cs__Graph!)
  repeatable on FRAGMENT_DEFINITION

directive @cs__resolve(
  graph: cs__Graph!,
  requires: cs__SelectionSet,
  provides: cs__SelectionSet)
  on FIELD_DEFINITION

directive @cs__error(
  graphs: [cs__Graph!],
  message: String)
    on OBJECT
    | INTERFACE
    | UNION
    | FIELD_DEFINITION

directive @cs__link(to: cs__OutboundLink!)
  on ENUM_VALUE

input cs__OutboundLink {
  http: cs__OutboundLinkHTTP
}

input cs__OutboundLinkHTTP {
  url: cs__URL
}

scalar cs__URL @specifiedBy(url: "https://specs.apollo.dev/v0.1#cs__url")
scalar cs__SelectionSet @specifiedBy(url: "https://specs.apollo.dev/v0.1#cs__selectionset")
`;


	var csdlDefinitions = /*#__PURE__*/Object.defineProperty({
		default: _default
	}, '__esModule', {value: true});

	var printComposedSdl_1 = createCommonjsModule(function (module, exports) {
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.printBlockString = exports.printWithReducedWhitespace = exports.printType = exports.printIntrospectionSchema = exports.printComposedSdl = void 0;



	const csdlDefinitions_1 = __importDefault(csdlDefinitions);
	function printComposedSdl(schema, serviceList, options) {
	    return printFilteredSchema(schema, serviceList, (n) => !graphql_1.isSpecifiedDirective(n) && !utils$1.isFederationDirective(n), isDefinedType, options);
	}
	exports.printComposedSdl = printComposedSdl;
	function printIntrospectionSchema(schema, options) {
	    return printFilteredSchema(schema, [], graphql_1.isSpecifiedDirective, graphql_1.isIntrospectionType, options);
	}
	exports.printIntrospectionSchema = printIntrospectionSchema;
	function isDefinedType(type) {
	    return (!graphql_1.isSpecifiedScalarType(type) &&
	        !graphql_1.isIntrospectionType(type) &&
	        !types.isFederationType(type));
	}
	function printFilteredSchema(schema, serviceList, directiveFilter, typeFilter, options) {
	    const directives = schema.getDirectives().filter(directiveFilter);
	    const types = Object.values(schema.getTypeMap())
	        .sort((type1, type2) => type1.name.localeCompare(type2.name))
	        .filter(typeFilter);
	    return ([printSchemaDefinition(schema)]
	        .concat(csdlDefinitions_1.default, printGraphs(serviceList), directives.map(directive => printDirective(directive, options)), types.map(type => printType(type, options)))
	        .filter(Boolean)
	        .join('\n\n') + '\n');
	}
	function printSchemaDefinition(schema) {
	    const operationTypes = [];
	    const queryType = schema.getQueryType();
	    if (queryType) {
	        operationTypes.push(`  query: ${queryType.name}`);
	    }
	    const mutationType = schema.getMutationType();
	    if (mutationType) {
	        operationTypes.push(`  mutation: ${mutationType.name}`);
	    }
	    const subscriptionType = schema.getSubscriptionType();
	    if (subscriptionType) {
	        operationTypes.push(`  subscription: ${subscriptionType.name}`);
	    }
	    return ('schema @using(spec: "https://specs.apollo.dev/cs/v0.1")' +
	        `\n{\n${operationTypes.join('\n')}\n}`);
	}
	function printGraphs(serviceList) {
	    return `enum cs__Graph {${serviceList.map(service => `\n  ${service.name} @cs__link(to: { http: { url: ${JSON.stringify(service.url)} } })`)}\n}`;
	}
	function printType(type, options) {
	    if (graphql_1.isScalarType(type)) {
	        return printScalar(type, options);
	    }
	    else if (graphql_1.isObjectType(type)) {
	        return printObject(type, options);
	    }
	    else if (graphql_1.isInterfaceType(type)) {
	        return printInterface(type, options);
	    }
	    else if (graphql_1.isUnionType(type)) {
	        return printUnion(type, options);
	    }
	    else if (graphql_1.isEnumType(type)) {
	        return printEnum(type, options);
	    }
	    else if (graphql_1.isInputObjectType(type)) {
	        return printInputObject(type, options);
	    }
	    throw Error('Unexpected type: ' + type.toString());
	}
	exports.printType = printType;
	function printScalar(type, options) {
	    return printDescription(options, type) + `scalar ${type.name}`;
	}
	function printObject(type, options) {
	    const interfaces = type.getInterfaces();
	    const implementedInterfaces = interfaces.length
	        ? ' implements ' + interfaces.map(i => i.name).join(' & ')
	        : '';
	    const isExtension = type.extensionASTNodes && type.astNode && !type.astNode.fields;
	    return (printDescription(options, type) +
	        (isExtension ? 'extend ' : '') +
	        `type ${type.name}` +
	        implementedInterfaces +
	        printFields(options, type) +
	        printKeys(type));
	}
	let nextKeyId = 0;
	function printKeys(type) {
	    var _a;
	    const metadata = (_a = type.extensions) === null || _a === void 0 ? void 0 : _a.federation;
	    if (!metadata)
	        return '';
	    const { serviceName: ownerService, keys } = metadata;
	    if (!ownerService || !keys)
	        return '';
	    return (Object.entries(keys).map(([service, keys]) => keys
	        .map((selections) => `\nfragment cs__keyFor_${type.name}_${nextKeyId++} on ${type.name} @cs__key(graph: ${service}) ${printFieldSet(selections)}`)
	        .join(''))
	        .join(''));
	}
	function printInterface(type, options) {
	    const isExtension = type.extensionASTNodes && type.astNode && !type.astNode.fields;
	    return (printDescription(options, type) +
	        (isExtension ? 'extend ' : '') +
	        `interface ${type.name}` +
	        printFields(options, type));
	}
	function printUnion(type, options) {
	    const types = type.getTypes();
	    const possibleTypes = types.length ? ' = ' + types.join(' | ') : '';
	    return printDescription(options, type) + 'union ' + type.name + possibleTypes;
	}
	function printEnum(type, options) {
	    const values = type
	        .getValues()
	        .map((value, i) => printDescription(options, value, '  ', !i) +
	        '  ' +
	        value.name +
	        printDeprecated(value));
	    return (printDescription(options, type) + `enum ${type.name}` + printBlock(values));
	}
	function printInputObject(type, options) {
	    const fields = Object.values(type.getFields()).map((f, i) => printDescription(options, f, '  ', !i) + '  ' + printInputValue(f));
	    return (printDescription(options, type) + `input ${type.name}` + printBlock(fields));
	}
	function printFields(options, type) {
	    var _a, _b;
	    const fields = Object.values(type.getFields()).map((f, i) => printDescription(options, f, '  ', !i) +
	        '  ' +
	        f.name +
	        printArgs(options, f.args, '  ') +
	        ': ' +
	        String(f.type) +
	        printDeprecated(f) +
	        printFederationFieldDirectives(f));
	    const isEntity = Boolean((_b = (_a = type.extensions) === null || _a === void 0 ? void 0 : _a.federation) === null || _b === void 0 ? void 0 : _b.keys);
	    return printBlock(fields, isEntity);
	}
	function printWithReducedWhitespace(ast) {
	    return graphql_1.print(ast)
	        .replace(/\s+/g, ' ')
	        .trim();
	}
	exports.printWithReducedWhitespace = printWithReducedWhitespace;
	function printFieldSet(selections) {
	    return `{ ${selections.map(printWithReducedWhitespace).join(' ')} }`;
	}
	function printFederationFieldDirectives(field) {
	    var _a;
	    if (!((_a = field.extensions) === null || _a === void 0 ? void 0 : _a.federation))
	        return '';
	    const { serviceName, requires = [], provides = [], } = field.extensions.federation;
	    return ` @cs__resolve(graph: ${serviceName}${requires.length ?
        `, requires: "${printFieldSet(requires)}"`
        : ''}${provides.length ?
        `, provides: "${printFieldSet(provides)}"`
        : ''})`;
	}
	function printBlock(items, onNewLine) {
	    return items.length !== 0
	        ? onNewLine
	            ? '\n{\n' + items.join('\n') + '\n}'
	            : ' {\n' + items.join('\n') + '\n}'
	        : '';
	}
	function printArgs(options, args, indentation = '') {
	    if (args.length === 0) {
	        return '';
	    }
	    if (args.every((arg) => !arg.description)) {
	        return '(' + args.map(printInputValue).join(', ') + ')';
	    }
	    return ('(\n' +
	        args
	            .map((arg, i) => printDescription(options, arg, '  ' + indentation, !i) +
	            '  ' +
	            indentation +
	            printInputValue(arg))
	            .join('\n') +
	        '\n' +
	        indentation +
	        ')');
	}
	function printInputValue(arg) {
	    const defaultAST = graphql_1.astFromValue(arg.defaultValue, arg.type);
	    let argDecl = arg.name + ': ' + String(arg.type);
	    if (defaultAST) {
	        argDecl += ` = ${graphql_1.print(defaultAST)}`;
	    }
	    return argDecl;
	}
	function printDirective(directive, options) {
	    return (printDescription(options, directive) +
	        'directive @' +
	        directive.name +
	        printArgs(options, directive.args) +
	        (directive.isRepeatable ? ' repeatable' : '') +
	        ' on ' +
	        directive.locations.join(' | '));
	}
	function printDeprecated(fieldOrEnumVal) {
	    if (!fieldOrEnumVal.isDeprecated) {
	        return '';
	    }
	    const reason = fieldOrEnumVal.deprecationReason;
	    const reasonAST = graphql_1.astFromValue(reason, graphql_1.GraphQLString);
	    if (reasonAST && reason !== graphql_1.DEFAULT_DEPRECATION_REASON) {
	        return ' @deprecated(reason: ' + graphql_1.print(reasonAST) + ')';
	    }
	    return ' @deprecated';
	}
	function printDescription(options, def, indentation = '', firstInBlock = true) {
	    const { description } = def;
	    if (description == null) {
	        return '';
	    }
	    if ((options === null || options === void 0 ? void 0 : options.commentDescriptions) === true) {
	        return printDescriptionWithComments(description, indentation, firstInBlock);
	    }
	    const preferMultipleLines = description.length > 70;
	    const blockString = printBlockString(description, '', preferMultipleLines);
	    const prefix = indentation && !firstInBlock ? '\n' + indentation : indentation;
	    return prefix + blockString.replace(/\n/g, '\n' + indentation) + '\n';
	}
	function printDescriptionWithComments(description, indentation, firstInBlock) {
	    const prefix = indentation && !firstInBlock ? '\n' : '';
	    const comment = description
	        .split('\n')
	        .map((line) => indentation + (line !== '' ? '# ' + line : '#'))
	        .join('\n');
	    return prefix + comment + '\n';
	}
	function printBlockString(value, indentation = '', preferMultipleLines = false) {
	    const isSingleLine = value.indexOf('\n') === -1;
	    const hasLeadingSpace = value[0] === ' ' || value[0] === '\t';
	    const hasTrailingQuote = value[value.length - 1] === '"';
	    const hasTrailingSlash = value[value.length - 1] === '\\';
	    const printAsMultipleLines = !isSingleLine ||
	        hasTrailingQuote ||
	        hasTrailingSlash ||
	        preferMultipleLines;
	    let result = '';
	    if (printAsMultipleLines && !(isSingleLine && hasLeadingSpace)) {
	        result += '\n' + indentation;
	    }
	    result += indentation ? value.replace(/\n/g, '\n' + indentation) : value;
	    if (printAsMultipleLines) {
	        result += '\n';
	    }
	    return '"""' + result.replace(/"""/g, '\\"""') + '"""';
	}
	exports.printBlockString = printBlockString;

	});

	var composeAndValidate_1 = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.composeAndValidate = exports.compositionHasErrors = void 0;




	function compositionHasErrors(compositionResult) {
	    return 'errors' in compositionResult;
	}
	exports.compositionHasErrors = compositionHasErrors;
	function composeAndValidate(serviceList) {
	    const errors = validate$2.validateServicesBeforeNormalization(serviceList);
	    const normalizedServiceList = serviceList.map(({ name, url, typeDefs }) => ({
	        name,
	        url,
	        typeDefs: normalize$1.normalizeTypeDefs(typeDefs),
	    }));
	    errors.push(...validate$2.validateServicesBeforeComposition(normalizedServiceList));
	    const compositionResult = compose.composeServices(normalizedServiceList);
	    errors.push(...compositionResult.errors);
	    errors.push(...validate$2.validateComposedSchema({
	        schema: compositionResult.schema,
	        serviceList,
	    }));
	    if (errors.length > 0) {
	        return {
	            schema: compositionResult.schema,
	            errors,
	        };
	    }
	    return {
	        schema: compositionResult.schema,
	        composedSdl: printComposedSdl_1.printComposedSdl(compositionResult.schema, serviceList),
	    };
	}
	exports.composeAndValidate = composeAndValidate;

	});

	Object.defineProperty(exports, "__esModule", { value: true });

	var types$1 = /*#__PURE__*/Object.freeze({
		__proto__: null
	});

	var require$$2 = /*@__PURE__*/getAugmentedNamespace(types$1);

	var composition = createCommonjsModule(function (module, exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
	    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	__exportStar(compose, exports);
	__exportStar(composeAndValidate_1, exports);
	__exportStar(require$$2, exports);

	Object.defineProperty(exports, "compositionRules", { enumerable: true, get: function () { return rules.compositionRules; } });

	Object.defineProperty(exports, "normalizeTypeDefs", { enumerable: true, get: function () { return normalize$1.normalizeTypeDefs; } });

	Object.defineProperty(exports, "defaultRootOperationNameLookup", { enumerable: true, get: function () { return utils$1.defaultRootOperationNameLookup; } });

	});

	var dist = createCommonjsModule(function (module, exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
	    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
	};
	Object.defineProperty(exports, "__esModule", { value: true });


	__exportStar(composition, exports);
	__exportStar(service, exports);

	});

	var dist$1 = createCommonjsModule(function (module, exports) {
	Object.defineProperty(exports, "__esModule", { value: true });

	Object.defineProperty(exports, "composeAndValidate", { enumerable: true, get: function () { return dist.composeAndValidate; } });

	Object.defineProperty(exports, "parseGraphqlDocument", { enumerable: true, get: function () { return graphql_1.parse; } });

	});

	var index = /*@__PURE__*/getDefaultExportFromCjs(dist$1);

	return index;

}(node_fetch_1));
