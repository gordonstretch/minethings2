<?
// needs $marketable, $price

echo '<span id="ButtonDiv'.$marketable['Marketable']['id'].'">';

echo $this->Html->link("[buy ".$marketable['Marketable']['name']." for <span id=\"".$marketable['Marketable']['name']."Price\">$price</span>g]", '#', array(
	'id' => 'BuyLink'.$marketable['Marketable']['id'],
	'onclick' => '$(\'BuyDiv'.$marketable['Marketable']['id'].'\').show(); return false;', 'escape' => false));

echo '<span id="BuyDiv'.$marketable['Marketable']['id'].'" style="display:none;">';
echo '<button onclick="$(\'BuySubmit'.$marketable['Marketable']['id'].'\').click();">Confirm</button>';
echo '</span>';
echo '</span>';

