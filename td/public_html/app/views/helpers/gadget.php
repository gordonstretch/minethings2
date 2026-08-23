<?

class GadgetHelper extends AppHelper
{
	var $helpers = array('Html', 'Time');

	function GadgetsMinerInfo($gadgetsMiner, $gadget)
	{
		$infoHtml = '';

		if ($gadgetsMiner['expire_time'])
			$expireText = 'Expires';
		else
			$expireText = 'Expired';
		$infoHtml .= '&nbsp;&nbsp;&nbsp;'.$expireText.' ';

		if ($gadgetsMiner['expire_time'])
			$infoHtml .= $this->Time->timeago($gadgetsMiner['expire_time']);

		if ($gadgetsMiner['expire_time'] and $gadget['has_page'])
			$infoHtml .= '&nbsp;&nbsp;'.$this->Html->link('Click here to view the '.$gadget['display_name'].' page.', '/gadgets/'.$gadget['name']);

		return $infoHtml;
	}

}

?>