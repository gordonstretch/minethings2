<?

class BuyHelper extends AppHelper
{
	var $helpers = array('Html', 'Ajax', 'Form');

	/*function Form($name, $marketableId, $cityId, $price, $onComplete='')
	{
		$this->marketables[$marketableId] = array(
			'name' => $name,
			'city_id' => $cityId,
			'price' => $price);
		
		$form = '';
		
		$form.= $this->Ajax->form(array('type' => 'post', 'options' => array(			
			'id' => 'BuyForm'.$marketableId,
			'style' => 'display:none',
			'url' => '/marketables/js_buy_now',
			'indicator' => 'LoadingDiv',
			'complete' => ''
				.'data = request.responseText.evalJSON();'
				.'if (data.price) {'
				.'	$("'.$name.'Price").update(data.price);'
				.'	$("BuyPrice'.$marketableId.'").writeAttribute("value", data.price);'
				.'}'
				.'else'
				.'	$("ButtonDiv'.$marketableId.'").hide();'
				.'$("BuyDiv'.$marketableId.'").hide();'
				.'if (data.message.length && $("ErrorDiv")) '
				.'	$("ErrorDiv").update(data.message);'
				.'else if ($("'.$name.'sOwned"))'
				.'	$("'.$name.'sOwned").update(parseInt($("'.$name.'sOwned").innerHTML) + 1);'
				.'$("goldanchor").update(data.gold);'
				.$onComplete
				,
			),
			null,
			false
			)); 
		
		$form.= $this->Form->input('Marketable.id', array('type' => 'hidden', 'value' => $marketableId));
		$form.= $this->Form->input('LimitOrder.city_id', array('type' => 'hidden', 'value' => $cityId));
		$form.= $this->Form->input('LimitOrder.price', array('type' => 'hidden', 'value' => $price, 'id' => 'BuyPrice'.$marketableId));
		$form.= $this->Form->input('LimitOrder.quantity', array('type' => 'hidden', 'value' => 1));
		$form.= $this->Form->end(array('id' => 'BuySubmit'.$marketableId, 'label' => 'Submit'));
		
		return $form;		
	}
	
	function Button($marketableId)
	{
		$button = '<span id="ButtonDiv'.$marketableId.'">';
		$name = $this->marketables[$marketableId]['name'];
		$price = $this->marketables[$marketableId]['price'];
		
		$button.= $this->Html->link("[buy $name for <span id=\"{$name}Price\">$price</span>g]", '#', array(
			'id' => 'BuyLink'.$marketableId,
			'onclick' => '$(\'BuyDiv'.$marketableId.'\').show(); return false;', 'escape' => false));
		
		$button.= '<span id="BuyDiv'.$marketableId.'" style="display:none;">';
		$button.= '<button onclick="$(\'BuySubmit'.$marketableId.'\').click();">Confirm</button>';
		$button.= '</span>';
		$button.= '</span>';
		
		return $button;
	}*/
}
?>
