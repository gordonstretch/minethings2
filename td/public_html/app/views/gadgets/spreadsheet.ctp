<div id="fullcenter">

<H2><? echo $displayName; ?></H2>
<p>Below are listed the names of things which can be purchased immediately in one city and sold immediately in another city for a profit.  The most profitable trades are listed first.</p>
<a href="javascript:void(0);" onclick="$('FilterDiv').show();">show filter</a>
<div id="FilterDiv" style="display:none">
<? 
echo $ajax->form('spreadsheet', 'post', array('update' => 'PricesDiv', 'indicator' => 'LoadingDiv', 'id' => 'FilterForm')); 
echo $form->input('Filter.sort', array('options' => array('profit' => 'profit', 'percent' => 'percent'), 'onchange' => '$("SubmitButton").click();'));
foreach($cities as $id => $name)
{
	echo $form->input('Filter.city'.$id, array('type' => "checkbox", 'onchange' => '$("SubmitButton").click();', 'label' => $name, 'checked' => true, 'div' => false));
}
?><BR><?
foreach(array(0=>'grey', 1=> 'yellow', 2=>'green', 3=>'blue', 4=>'red', 5=>'purple', 6=>'orange') as $r => $color)
	echo $form->input('Filter.rarity'.$r, array('type' => 'checkbox', 'onchange' => '$("SubmitButton").click();', 'label' => $color, 'checked' => true, 'div' => false));
echo $form->end(array('id' => 'SubmitButton', 'style' => 'display:none'));
?>
</div>
<BR><BR>
<div id="PricesDiv"><? include 'js_spreadsheet.ctp'; ?></div>
</div>