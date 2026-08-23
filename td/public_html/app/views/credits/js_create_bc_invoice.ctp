<?	
echo $javascript->link('prototype1.6.1/prototype.js');
echo $javascript->link('scriptaculous1.8.3/scriptaculous.js');
?>
<? if (isset($error)): echo $error; else: ?>

<style> 
p.addr {text-align:center;} 
img.addr { display:block; margin-left:auto; margin-right:auto; }
</style>

<a style="position:absolute;" href="/credits/buy">Back</a> 

<? 
echo $html->image('qr/'.$filename, array('class' => 'addr')); 
?>

<p class="addr">
<a href="bitcoin:<? echo $address; ?>?amount=<? echo $priceBTC; ?>" tabindex=1 target='_blank'><? echo "Send $pricemBTC mBTC to"; ?></a>
</p>

<p class="addr">
<? echo $address; ?>
</p>

<div id="PaidDiv" style="text-align:center;"></div>
<? /*echo $ajax->remoteTimer(array(
	'url' => "/credits/js_invoice_status/$invoiceId",
	'update' => 'PaidDiv',
	'frequency' => 11,
	'indicator' => 'LoadingDiv',
	'timervar' => 'pex',
	));*/
?>
	

<? 
echo '<script type="text/javascript">'."\n";
echo "//<![CDATA[\n";
echo "pex = new PeriodicalExecuter(function(pe) {new Ajax.Updater('PaidDiv','/credits/js_invoice_status/$invoiceId', {asynchronous:true, evalScripts:true, onComplete:function(request, json) {Element.hide('LoadingDiv');}, onLoading:function(request) {Element.show('LoadingDiv');}, requestHeaders:['X-Update', 'PaidDiv']})}, 11)";
echo "//]]>\n";
echo '</script>';
endif;
?>



