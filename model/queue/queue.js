steal('can/util', 'can/model', function(can){

	var cleanAttrs = function(changedAttrs, attrs){
			var attr, current, path;
			if(changedAttrs){
				for(var i = 0; i < changedAttrs.length; i++){
					current = attrs;
					path    = changedAttrs[i].split('.');
					while(path.length > 1){
						current = current && current[path.shift()];
					}
					current && delete current[path.shift()];
				}
			}
			return attrs;
		},
		queueRequests = function( success, error, method, callback) {
			this._requestQueue = this._requestQueue || [];
			this._changedAttrs = this._changedAttrs || [];

			var def          = new can.Deferred,
				self         = this,
				attrs        = this.attr(),
				queue        = this._requestQueue,
				changedAttrs = this._changedAttrs,
				reqFn, index;

			reqFn = (function(self, type, success, error){
				// Function that performs actual request
				return function(){
					return self.constructor._makeRequest([self, attrs], type, success, error, callback)
				}
				// we shouldn't pass this, instead we need to pass something like
				// [this, this.serialize()]
			})(this, method || (this.isNew() ? 'create' : 'update'), function(){
				// resolve deferred with results from the request
				def.resolveWith(self, arguments);
				// remove current deferred from the queue 
				queue.splice(0, 1);
				if(queue.length > 0){
					// replace queued wrapper function with deferred
					// returned from the makeRequest function so we 
					// can access it's `abort` function
					queue[0] = queue[0]();
				} else {
					changedAttrs.splice(0);
				}
				
			}, function(){
				// reject deferred with results from the request
				def.rejectWith(self, arguments);
				// since we failed remove all pending requests from the queue
				queue.splice(0);
				changedAttrs.splice(0);
			})

			// Add our fn to the queue
			index = queue.push(reqFn) - 1;

			// If there is only one request in the queue, run
			// it immediately.
			if(queue.length === 1){
				// replace queued wrapper function with deferred
				// returned from the makeRequest function so we 
				// can access it's `abort` function
				queue[0] = queue[0]();
			}

			def.abort = function(){
				var abort;
				// check if this request is running, if it's not
				// just remove it from the queue
				// 
				// also all subsequent requests should be removed too
				abort = queue[index].abort && queue[index].abort();
				// remove aborted request and any requests after it
				queue.splice(index);
				changedAttrs.splice(0);
				return abort;
			}
			// deferred will be resolved with original success and
			// error functions
			def.then(success, error);

			return def;
		},
		_changes  = can.Model.prototype._changes,
		destroyFn = can.Model.prototype.destroy;

	can.each(["created", "updated", "destroyed"], function(fn){
		var prototypeFn = can.Model.prototype[fn];

		can.Model.prototype[fn] = function(attrs){
			if(attrs && typeof attrs == 'object'){
				attrs = attrs.attr ? attrs.attr() : attrs;
				attrs = cleanAttrs(this._changedAttrs || [], attrs);
			}
			prototypeFn.call(this, attrs);
		}
	})

	can.extend(can.Model.prototype, {
		_changes: function(ev, attr, how,newVal, oldVal){
			// record changes if there is a request running
			this._changedAttrs && this._changedAttrs.push(attr);
			_changes.apply(this, arguments);
		},
		hasQueuedRequests : function(){
			return this._requestQueue && this._requestQueue.length > 1;
		},
		save : function(){
			return queueRequests.apply(this, arguments);
		},
		destroy : function(success, error){
			if(this.isNew()){
				return destroyFn.call(this, success, error);
			}
			return queueRequests.call(this, success, error, 'destroy', 'destroyed');
		}
	})
})