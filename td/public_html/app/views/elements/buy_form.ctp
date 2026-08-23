<?
//  needs $marketable, $cityId, $price, $onComplete
	
if (!isset($onComplete))
	$onComplete = '';
	
$form = $ajax->form(array('type' => 'post', 'options' => array(			
	'id' => 'BuyForm'.$marketable['Marketable']['id'],
	'style' => 'display:none',
	'url' => '/marketables/js_buy_now',
	'indicator' => 'LoadingDiv',
	'complete' => ''
		.'data = request.responseText.evalJSON();'
		.'if (data.price) {'
		.'	$("'.$marketable['Marketable']['name'].'Price").update(data.price);'
		.'	$("BuyPrice'.$marketable['Marketable']['id'].'").writeAttribute("value", data.price);'
		.'}'
		.'else'
		.'	$("ButtonDiv'.$marketable['Marketable']['id'].'").hide();'
		.'$("BuyDiv'.$marketable['Marketable']['id'].'").hide();'
		.'if (data.message.length && $("ErrorDiv")) '
		.'	$("ErrorDiv").update(data.message);'
		.'else if ($("'.$marketable['Marketable']['name'].'sOwned"))'
		.'	$("'.$marketable['Marketable']['name'].'sOwned").update(parseInt($("'.$marketable['Marketable']['name'].'sOwned").innerHTML) + 1);'
		.'SetGold(data.gold);'
		.$onComplete
		,
	),
	null,
	false
	)); 

$form.= $this->Form->input('Marketable.id', array('type' => 'hidden', 'value' => $marketable['Marketable']['id']));
$form.= $this->Form->input('LimitOrder.city_id', array('type' => 'hidden', 'value' => $cityId));
$form.= $this->Form->input('LimitOrder.price', array('type' => 'hidden', 'value' => $price, 'id' => 'BuyPrice'.$marketable['Marketable']['id']));
$form.= $this->Form->input('LimitOrder.quantity', array('type' => 'hidden', 'value' => 1));
$form.= $this->Form->end(array('id' => 'BuySubmit'.$marketable['Marketable']['id'], 'label' => 'Submit'));

echo $form;		
